use std::{
    collections::HashMap,
    fmt,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::LazyLock,
};

use regex::Regex;
use sha2::{Digest, Sha256};
use zip::ZipArchive;

static CSS_CLASS_RULE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)\.([A-Za-z_][A-Za-z0-9_-]*)\s*\{([^}]*)\}")
        .expect("EPUB class rule should compile")
});
static CSS_MARGIN_LEFT_RULE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)margin-left\s*:\s*([-+]?[0-9]*\.?[0-9]+)(em|rem|px|pt)?")
        .expect("margin-left rule should compile")
});
static CSS_MARGIN_RULE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)margin\s*:\s*([^;\n}]+)").expect("margin shorthand rule should compile")
});
static CSS_FONT_WEIGHT_RULE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)font-weight\s*:\s*(bold|[6-9]00)").expect("font-weight rule should compile")
});

use crate::text::{normalize_reader_paragraphs, normalize_reader_text};

#[derive(Debug, Clone)]
pub struct ImportedBook {
    pub id: String,
    pub title: String,
    pub author: String,
    pub language: Option<String>,
    pub cover_image: Option<ImportedCover>,
    pub source_path: String,
    pub chapters: Vec<ImportedChapter>,
}

#[derive(Debug, Clone)]
pub struct ImportedCover {
    pub media_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ImportedChapter {
    pub id: String,
    pub title: String,
    pub index: usize,
    pub body: String,
    pub references: Vec<ImportedReference>,
    pub links: Vec<ImportedLink>,
    pub presentations: Vec<ImportedParagraphPresentation>,
}

#[derive(Debug, Clone)]
pub struct ImportedParagraphPresentation {
    pub index: usize,
    pub kind: String,
    pub indent_level: usize,
    pub marker: Option<String>,
    pub emphasized: bool,
}

#[derive(Debug, Clone)]
pub struct ImportedReference {
    pub id: String,
    pub offset: usize,
    pub marker: String,
    pub kind: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ImportedLink {
    pub id: String,
    pub offset: usize,
    pub length: usize,
    pub href: Option<String>,
    pub target_chapter_id: Option<String>,
    pub target_text: Option<String>,
}

#[derive(Debug)]
pub enum ImportError {
    EmptyBook,
    InvalidArchive,
    MissingContainer,
    MissingPackage,
    MissingSpine,
    ReadFailed(String),
}

impl fmt::Display for ImportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ImportError::EmptyBook => {
                write!(
                    formatter,
                    "We couldn't find readable chapter text in that EPUB."
                )
            }
            ImportError::InvalidArchive => {
                write!(formatter, "That file does not look like an EPUB.")
            }
            ImportError::MissingContainer => {
                write!(formatter, "That EPUB is missing its reading manifest.")
            }
            ImportError::MissingPackage => {
                write!(formatter, "That EPUB is missing its book metadata.")
            }
            ImportError::MissingSpine => {
                write!(
                    formatter,
                    "That EPUB does not include a readable chapter order."
                )
            }
            ImportError::ReadFailed(message) => write!(formatter, "{message}"),
        }
    }
}

pub fn import_epub_file(path: &Path) -> Result<ImportedBook, ImportError> {
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("epub"))
    {
        return Err(ImportError::InvalidArchive);
    }

    let mut file = File::open(path)
        .map_err(|_| ImportError::ReadFailed("We couldn't open that EPUB.".to_string()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| ImportError::ReadFailed("We couldn't open that EPUB.".to_string()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|_| ImportError::ReadFailed("We couldn't open that EPUB.".to_string()))?;

    let hash = hasher.finalize();
    let book_id = format!("book-{}", hex_prefix(&hash, 16));
    let mut archive = ZipArchive::new(file).map_err(|_| ImportError::InvalidArchive)?;
    let container = read_zip_text(&mut archive, "META-INF/container.xml")
        .ok_or(ImportError::MissingContainer)?;
    let opf_path = find_package_path(&container).ok_or(ImportError::MissingContainer)?;
    let opf = read_zip_text(&mut archive, &opf_path).ok_or(ImportError::MissingPackage)?;
    let package = parse_package(&opf, &opf_path).ok_or(ImportError::MissingPackage)?;
    let navigation_titles = read_navigation_titles(&mut archive, &package);
    let cover_image = read_cover_image(&mut archive, &package);
    let mut readable_documents = package
        .manifest
        .values()
        .filter_map(|item| {
            let path = normalize_epub_path(&package.base_dir, &item.href);
            read_zip_text(&mut archive, &path).map(|xml| (path, xml))
        })
        .collect::<HashMap<_, _>>();
    readable_documents.extend(package.stylesheets.iter().filter_map(|item| {
        let path = normalize_epub_path(&package.base_dir, &item.href);
        read_zip_text(&mut archive, &path).map(|css| (path, css))
    }));
    let chapter_ids_by_path = package
        .spine
        .iter()
        .enumerate()
        .filter(|(_, item)| item.linear)
        .filter_map(|(index, item)| {
            let manifest_item = package.manifest.get(&item.idref)?;
            Some((
                normalize_epub_path(&package.base_dir, &manifest_item.href),
                format!("{book_id}:chapter-{}", index + 1),
            ))
        })
        .collect::<HashMap<_, _>>();
    let epub_styles = EpubStyles::from_documents(&readable_documents);
    let mut chapters = Vec::new();

    for (chapter_index, item) in package.spine.iter().enumerate() {
        if !item.linear {
            continue;
        }

        let Some(manifest_item) = package.manifest.get(&item.idref) else {
            continue;
        };
        let chapter_path = normalize_epub_path(&package.base_dir, &manifest_item.href);
        let Some(chapter_xml) = readable_documents.get(&chapter_path) else {
            continue;
        };
        let Ok(chapter_document) = parse_epub_xml(chapter_xml) else {
            continue;
        };
        let extracted = extract_chapter_content(
            &chapter_document,
            &chapter_path,
            &readable_documents,
            &chapter_ids_by_path,
            &epub_styles,
            &format!("{book_id}:chapter-{}", chapter_index + 1),
        );

        if extracted.body.is_empty() {
            continue;
        }

        chapters.push(ImportedChapter {
            id: format!("{book_id}:chapter-{}", chapter_index + 1),
            title: navigation_titles
                .get(&chapter_path)
                .cloned()
                .or_else(|| first_heading(&chapter_document))
                .or_else(|| first_text(&chapter_document, "title"))
                .unwrap_or_else(|| format!("Chapter {}", chapter_index + 1)),
            index: chapter_index,
            body: extracted.body,
            references: extracted.references,
            links: extracted.links,
            presentations: extracted.presentations,
        });
    }

    if package.spine.is_empty() {
        return Err(ImportError::MissingSpine);
    }

    if chapters.is_empty() {
        return Err(ImportError::EmptyBook);
    }

    Ok(ImportedBook {
        id: book_id,
        title: package.title.unwrap_or_else(|| fallback_book_title(path)),
        author: package
            .author
            .unwrap_or_else(|| "Unknown author".to_string()),
        language: package.language,
        cover_image,
        source_path: path.to_string_lossy().to_string(),
        chapters,
    })
}

pub fn read_epub_language(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let container = read_zip_text(&mut archive, "META-INF/container.xml")?;
    let opf_path = find_package_path(&container)?;
    let opf = read_zip_text(&mut archive, &opf_path)?;

    parse_package(&opf, &opf_path)?.language
}

#[derive(Debug)]
struct PackageDocument {
    title: Option<String>,
    author: Option<String>,
    language: Option<String>,
    base_dir: String,
    manifest: HashMap<String, ManifestItem>,
    spine: Vec<SpineItem>,
    nav_path: Option<String>,
    ncx_path: Option<String>,
    cover_image: Option<CoverImageRef>,
    stylesheets: Vec<ManifestItem>,
}

#[derive(Debug, Clone)]
struct ManifestItem {
    href: String,
    media_type: String,
    properties: String,
}

#[derive(Debug, Clone)]
struct SpineItem {
    idref: String,
    linear: bool,
}

#[derive(Debug, Clone)]
struct CoverImageRef {
    path: String,
    media_type: String,
}

fn parse_package(xml: &str, opf_path: &str) -> Option<PackageDocument> {
    let document = parse_epub_xml(xml).ok()?;
    let title = first_text(&document, "title");
    let author = first_text(&document, "creator");
    let language = first_text(&document, "language");
    let all_manifest_items = document
        .descendants()
        .filter(|node| node.tag_name().name() == "item")
        .filter_map(|node| {
            let id = node.attribute("id")?.to_string();
            let href = node.attribute("href")?.to_string();
            let media_type = node.attribute("media-type").unwrap_or_default().to_string();
            let properties = node.attribute("properties").unwrap_or_default().to_string();

            Some((
                id,
                ManifestItem {
                    href,
                    media_type,
                    properties,
                },
            ))
        })
        .collect::<HashMap<_, _>>();
    let manifest = all_manifest_items
        .iter()
        .filter(|(_, item)| is_readable_manifest_item(item))
        .map(|(id, item)| (id.clone(), item.clone()))
        .collect();
    let stylesheets = all_manifest_items
        .values()
        .filter(|item| item.media_type.eq_ignore_ascii_case("text/css"))
        .cloned()
        .collect();
    let spine_node = document
        .descendants()
        .find(|node| node.tag_name().name() == "spine");
    let ncx_path = spine_node
        .and_then(|node| node.attribute("toc"))
        .and_then(|id| all_manifest_items.get(id))
        .map(|item| normalize_epub_path(&epub_parent(opf_path), &item.href));
    let cover_image = resolve_cover_image(&document, &epub_parent(opf_path), &all_manifest_items);
    let spine = document
        .descendants()
        .filter(|node| node.tag_name().name() == "itemref")
        .filter_map(|node| {
            Some(SpineItem {
                idref: node.attribute("idref")?.to_string(),
                linear: node.attribute("linear") != Some("no"),
            })
        })
        .collect();
    let nav_path = all_manifest_items
        .values()
        .find(|item| {
            item.properties
                .split_whitespace()
                .any(|value| value == "nav")
        })
        .map(|item| normalize_epub_path(&epub_parent(opf_path), &item.href));

    Some(PackageDocument {
        title,
        author,
        language,
        base_dir: epub_parent(opf_path),
        manifest,
        spine,
        nav_path,
        ncx_path,
        cover_image,
        stylesheets,
    })
}

fn is_readable_manifest_item(item: &ManifestItem) -> bool {
    let href = strip_href_fragment(&item.href).to_ascii_lowercase();
    let media_type = item.media_type.to_ascii_lowercase();

    media_type.contains("xhtml")
        || media_type == "text/html"
        || href.ends_with(".xhtml")
        || href.ends_with(".html")
        || href.ends_with(".htm")
}

fn resolve_cover_image(
    document: &roxmltree::Document<'_>,
    base_dir: &str,
    manifest_items: &HashMap<String, ManifestItem>,
) -> Option<CoverImageRef> {
    let metadata_cover_id = document
        .descendants()
        .find(|node| {
            node.tag_name().name() == "meta"
                && node
                    .attribute("name")
                    .is_some_and(|name| name.eq_ignore_ascii_case("cover"))
        })
        .and_then(|node| node.attribute("content"));

    metadata_cover_id
        .and_then(|id| manifest_items.get(id))
        .and_then(|item| cover_ref_from_manifest_item(base_dir, item))
        .or_else(|| {
            manifest_items
                .values()
                .find(|item| {
                    item.properties
                        .split_whitespace()
                        .any(|property| property == "cover-image")
                })
                .and_then(|item| cover_ref_from_manifest_item(base_dir, item))
        })
        .or_else(|| {
            manifest_items
                .values()
                .filter_map(|item| cover_ref_from_manifest_item(base_dir, item))
                .find(|cover| {
                    let file_name = cover.path.to_ascii_lowercase();
                    file_name.contains("cover") || file_name.contains("front")
                })
        })
}

fn cover_ref_from_manifest_item(base_dir: &str, item: &ManifestItem) -> Option<CoverImageRef> {
    let media_type = image_media_type(item)?;

    Some(CoverImageRef {
        path: normalize_epub_path(base_dir, &item.href),
        media_type,
    })
}

fn image_media_type(item: &ManifestItem) -> Option<String> {
    let media_type = item.media_type.to_ascii_lowercase();
    if media_type.starts_with("image/") {
        return Some(media_type);
    }

    let href = strip_href_fragment(&item.href).to_ascii_lowercase();
    let inferred = if href.ends_with(".jpg") || href.ends_with(".jpeg") {
        "image/jpeg"
    } else if href.ends_with(".png") {
        "image/png"
    } else if href.ends_with(".gif") {
        "image/gif"
    } else if href.ends_with(".webp") {
        "image/webp"
    } else if href.ends_with(".svg") {
        "image/svg+xml"
    } else {
        return None;
    };

    Some(inferred.to_string())
}

fn read_cover_image<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    package: &PackageDocument,
) -> Option<ImportedCover> {
    let cover = package.cover_image.as_ref()?;
    let bytes = read_zip_bytes(archive, &cover.path)?;

    Some(ImportedCover {
        media_type: cover.media_type.clone(),
        bytes,
    })
}

fn find_package_path(container_xml: &str) -> Option<String> {
    let document = parse_epub_xml(container_xml).ok()?;
    document
        .descendants()
        .find(|node| node.tag_name().name() == "rootfile")
        .and_then(|node| node.attribute("full-path"))
        .map(ToString::to_string)
}

fn read_navigation_titles<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    package: &PackageDocument,
) -> HashMap<String, String> {
    let mut titles = HashMap::new();

    if let Some(nav_path) = &package.nav_path {
        if let Some(nav_xml) = read_zip_text(archive, nav_path) {
            merge_navigation_titles(&mut titles, parse_epub3_nav_titles(&nav_xml, nav_path));
        }
    }

    if let Some(ncx_path) = &package.ncx_path {
        if let Some(ncx_xml) = read_zip_text(archive, ncx_path) {
            merge_navigation_titles(&mut titles, parse_ncx_titles(&ncx_xml, ncx_path));
        }
    }

    titles
}

fn merge_navigation_titles(target: &mut HashMap<String, String>, source: HashMap<String, String>) {
    for (path, title) in source {
        target.entry(path).or_insert(title);
    }
}

fn parse_epub3_nav_titles(xml: &str, nav_path: &str) -> HashMap<String, String> {
    let Ok(document) = parse_epub_xml(xml) else {
        return HashMap::new();
    };
    let nav_base_dir = epub_parent(nav_path);
    let toc_nav = document
        .descendants()
        .find(|node| node.tag_name().name() == "nav" && has_epub_type(node, "toc"))
        .unwrap_or_else(|| document.root_element());

    let mut titles = HashMap::new();

    for node in toc_nav
        .descendants()
        .filter(|node| node.tag_name().name() == "a")
    {
        let Some(href) = node.attribute("href") else {
            continue;
        };
        let title = normalize_reader_text(&node_text(node));
        if title.is_empty() {
            continue;
        }

        titles
            .entry(normalize_epub_path(&nav_base_dir, href))
            .or_insert(title);
    }

    titles
}

fn has_epub_type(node: &roxmltree::Node<'_, '_>, expected_type: &str) -> bool {
    node.attributes().any(|attribute| {
        attribute.name() == "type"
            && attribute
                .value()
                .split_whitespace()
                .any(|value| value == expected_type)
    })
}

fn parse_ncx_titles(xml: &str, ncx_path: &str) -> HashMap<String, String> {
    let Ok(document) = parse_epub_xml(xml) else {
        return HashMap::new();
    };
    let ncx_base_dir = epub_parent(ncx_path);

    let mut titles = HashMap::new();

    for node in document
        .descendants()
        .filter(|node| node.tag_name().name() == "navPoint")
    {
        let Some(src) = node
            .descendants()
            .find(|child| child.tag_name().name() == "content")
            .and_then(|child| child.attribute("src"))
        else {
            continue;
        };
        let Some(title) = node
            .descendants()
            .find(|child| child.tag_name().name() == "navLabel")
            .map(node_text)
            .map(|value| normalize_reader_text(&value))
            .filter(|value| !value.is_empty())
        else {
            continue;
        };

        titles
            .entry(normalize_epub_path(&ncx_base_dir, src))
            .or_insert(title);
    }

    titles
}

#[cfg(test)]
fn extract_chapter_heading(xml: &str) -> Option<String> {
    let document = parse_epub_xml(xml).ok()?;
    first_heading(&document)
}

#[cfg(test)]
fn extract_chapter_text(xml: &str) -> String {
    let Ok(document) = parse_epub_xml(xml) else {
        return String::new();
    };
    extract_chapter_text_from_document(&document)
}

#[cfg(test)]
fn extract_chapter_text_from_document(document: &roxmltree::Document<'_>) -> String {
    extract_chapter_content(
        document,
        "chapter.xhtml",
        &HashMap::new(),
        &HashMap::new(),
        &EpubStyles::default(),
        "chapter",
    )
    .body
}

struct ExtractedChapterContent {
    body: String,
    references: Vec<ImportedReference>,
    links: Vec<ImportedLink>,
    presentations: Vec<ImportedParagraphPresentation>,
}

fn extract_chapter_content(
    document: &roxmltree::Document<'_>,
    chapter_path: &str,
    readable_documents: &HashMap<String, String>,
    chapter_ids_by_path: &HashMap<String, String>,
    epub_styles: &EpubStyles,
    chapter_id: &str,
) -> ExtractedChapterContent {
    let body = document
        .descendants()
        .find(|node| node.tag_name().name() == "body")
        .unwrap_or_else(|| document.root_element());
    let block_nodes = collect_reading_block_nodes(body);

    if block_nodes.is_empty() {
        let extracted =
            extract_reading_block(body, chapter_path, readable_documents, chapter_ids_by_path);
        let presentation = paragraph_presentation(body, epub_styles, &extracted, 0);
        return ExtractedChapterContent {
            body: extracted.text,
            references: extracted
                .references
                .into_iter()
                .enumerate()
                .map(|(index, reference)| ImportedReference {
                    id: format!("{chapter_id}:reference-{}", index + 1),
                    offset: reference.offset,
                    marker: reference.marker,
                    kind: reference.kind,
                    content: reference.content,
                })
                .collect(),
            links: extracted
                .links
                .into_iter()
                .enumerate()
                .map(|(index, link)| ImportedLink {
                    id: format!("{chapter_id}:link-{}", index + 1),
                    offset: link.offset,
                    length: link.length,
                    href: link.href,
                    target_chapter_id: link.target_chapter_id,
                    target_text: link.target_text,
                })
                .collect(),
            presentations: vec![presentation],
        };
    }

    let mut blocks = Vec::new();
    let mut references = Vec::new();
    let mut links = Vec::new();
    let mut presentations = Vec::new();
    for block in block_nodes {
        let extracted =
            extract_reading_block(block, chapter_path, readable_documents, chapter_ids_by_path);
        if extracted.text.is_empty() {
            continue;
        }
        presentations.push(paragraph_presentation(
            block,
            epub_styles,
            &extracted,
            presentations.len(),
        ));
        let block_offset = blocks.iter().map(String::len).sum::<usize>() + blocks.len() * 2;
        for reference in extracted.references {
            let index = references.len();
            references.push(ImportedReference {
                id: format!("{chapter_id}:reference-{}", index + 1),
                offset: block_offset + reference.offset,
                marker: reference.marker,
                kind: reference.kind,
                content: reference.content,
            });
        }
        for link in extracted.links {
            let index = links.len();
            links.push(ImportedLink {
                id: format!("{chapter_id}:link-{}", index + 1),
                offset: block_offset + link.offset,
                length: link.length,
                href: link.href,
                target_chapter_id: link.target_chapter_id,
                target_text: link.target_text,
            });
        }
        blocks.push(extracted.text);
    }

    ExtractedChapterContent {
        body: normalize_reader_paragraphs(&blocks.join("\n\n")),
        references,
        links,
        presentations,
    }
}

struct ExtractedReadingBlock {
    text: String,
    references: Vec<ExtractedReference>,
    links: Vec<ExtractedLink>,
}

struct ExtractedReference {
    offset: usize,
    marker: String,
    kind: String,
    content: String,
}

struct ExtractedLink {
    offset: usize,
    length: usize,
    href: Option<String>,
    target_chapter_id: Option<String>,
    target_text: Option<String>,
}

#[derive(Default)]
struct EpubStyles {
    classes: HashMap<String, EpubClassStyle>,
}

#[derive(Default)]
struct EpubClassStyle {
    margin_left_em: f32,
    bold: bool,
}

impl EpubStyles {
    fn from_documents(documents: &HashMap<String, String>) -> Self {
        let mut styles = Self::default();
        for (path, css) in documents {
            if !path.to_ascii_lowercase().ends_with(".css") {
                continue;
            }
            for captures in CSS_CLASS_RULE.captures_iter(css) {
                let Some(name) = captures.get(1).map(|value| value.as_str()) else {
                    continue;
                };
                let declarations = captures.get(2).map(|value| value.as_str()).unwrap_or("");
                styles.classes.insert(
                    name.to_string(),
                    EpubClassStyle {
                        margin_left_em: css_margin_left_em(declarations),
                        bold: css_is_bold(declarations),
                    },
                );
            }
        }
        styles
    }

    fn margin_left_em(&self, node: roxmltree::Node<'_, '_>) -> f32 {
        node.attribute("class")
            .into_iter()
            .flat_map(str::split_whitespace)
            .filter_map(|name| self.classes.get(name))
            .map(|style| style.margin_left_em)
            .fold(
                css_margin_left_em(node.attribute("style").unwrap_or("")),
                f32::max,
            )
    }

    fn is_bold(&self, node: roxmltree::Node<'_, '_>) -> bool {
        node.descendants()
            .filter(|entry| entry.is_element())
            .any(|entry| {
                matches!(entry.tag_name().name(), "b" | "strong")
                    || css_is_bold(entry.attribute("style").unwrap_or(""))
                    || entry
                        .attribute("class")
                        .into_iter()
                        .flat_map(str::split_whitespace)
                        .filter_map(|name| self.classes.get(name))
                        .any(|style| style.bold)
            })
    }
}

fn css_margin_left_em(declarations: &str) -> f32 {
    if let Some(captures) = CSS_MARGIN_LEFT_RULE.captures(declarations) {
        return css_length_em(
            captures.get(1).map(|value| value.as_str()).unwrap_or("0"),
            captures.get(2).map(|value| value.as_str()).unwrap_or("em"),
        );
    }
    let Some(values) = CSS_MARGIN_RULE
        .captures(declarations)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().split_whitespace().collect::<Vec<_>>())
    else {
        return 0.0;
    };
    let left = match values.as_slice() {
        [all] => *all,
        [_, horizontal] | [_, horizontal, _] => *horizontal,
        [_, _, _, left, ..] => *left,
        _ => return 0.0,
    };
    let value = left.trim_end_matches(|character: char| character.is_ascii_alphabetic());
    let unit = &left[value.len()..];
    css_length_em(value, unit)
}

fn css_length_em(value: &str, unit: &str) -> f32 {
    let value = value.parse::<f32>().unwrap_or(0.0).max(0.0);
    match unit.to_ascii_lowercase().as_str() {
        "px" => value / 16.0,
        "pt" => value / 12.0,
        _ => value,
    }
}

fn css_is_bold(declarations: &str) -> bool {
    CSS_FONT_WEIGHT_RULE.is_match(declarations)
}

fn paragraph_presentation(
    block: roxmltree::Node<'_, '_>,
    styles: &EpubStyles,
    extracted: &ExtractedReadingBlock,
    index: usize,
) -> ImportedParagraphPresentation {
    let list = block
        .ancestors()
        .find(|ancestor| matches!(ancestor.tag_name().name(), "ol" | "ul"));
    if block.tag_name().name() == "li" {
        let indent_level = block
            .ancestors()
            .filter(|ancestor| matches!(ancestor.tag_name().name(), "ol" | "ul"))
            .count()
            .saturating_sub(1);
        let ordered = list.is_some_and(|node| node.tag_name().name() == "ol");
        let marker = ordered.then(|| {
            let start = list
                .and_then(|node| node.attribute("start"))
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(1);
            let position = block
                .prev_siblings()
                .skip(1)
                .filter(|sibling| sibling.tag_name().name() == "li")
                .count();
            (start + position).to_string()
        });
        return ImportedParagraphPresentation {
            index,
            kind: if ordered { "ordered" } else { "unordered" }.to_string(),
            indent_level,
            marker,
            emphasized: styles.is_bold(block),
        };
    }

    let navigation_item = extracted.links.len() == 1
        && extracted.links[0].href.is_none()
        && extracted.links[0].offset == 0
        && extracted.links[0].length == extracted.text.len();
    let heading = matches!(
        block.tag_name().name(),
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
    );
    ImportedParagraphPresentation {
        index,
        kind: if navigation_item {
            "navigation"
        } else if heading {
            "heading"
        } else if block.tag_name().name() == "blockquote" {
            "quote"
        } else {
            "body"
        }
        .to_string(),
        indent_level: (styles.margin_left_em(block) / 0.75)
            .round()
            .clamp(0.0, 4.0) as usize,
        marker: None,
        emphasized: heading || styles.is_bold(block),
    }
}

fn extract_reading_block(
    block: roxmltree::Node<'_, '_>,
    chapter_path: &str,
    readable_documents: &HashMap<String, String>,
    chapter_ids_by_path: &HashMap<String, String>,
) -> ExtractedReadingBlock {
    let mut annotated = String::new();
    let mut resolved = Vec::new();
    collect_annotated_text(
        block,
        block,
        chapter_path,
        readable_documents,
        chapter_ids_by_path,
        &mut annotated,
        &mut resolved,
    );
    let normalized = normalize_reader_text(&annotated);
    let mut text = String::new();
    let mut references = Vec::new();
    let mut links = Vec::new();
    let mut remaining = normalized.as_str();

    while let Some(start) = remaining.find('\u{e000}') {
        text.push_str(&remaining[..start]);
        let after_start = &remaining[start + '\u{e000}'.len_utf8()..];
        let Some(end) = after_start.find('\u{e001}') else {
            text.push_str(&remaining[start..]);
            remaining = "";
            break;
        };
        if let Ok(index) = after_start[..end].parse::<usize>() {
            if let Some(annotation) = resolved.get(index) {
                match annotation {
                    ResolvedAnnotation::Reference(reference) => {
                        references.push(ExtractedReference {
                            offset: text.len(),
                            marker: reference.marker.clone(),
                            kind: reference.kind.clone(),
                            content: reference.content.clone(),
                        });
                    }
                    ResolvedAnnotation::Link(link) => {
                        let offset = text.len();
                        text.push_str(&link.label);
                        links.push(ExtractedLink {
                            offset,
                            length: link.label.len(),
                            href: link.href.clone(),
                            target_chapter_id: link.target_chapter_id.clone(),
                            target_text: link.target_text.clone(),
                        });
                    }
                }
            }
        }
        remaining = &after_start[end + '\u{e001}'.len_utf8()..];
    }
    text.push_str(remaining);

    ExtractedReadingBlock {
        text,
        references,
        links,
    }
}

fn collect_annotated_text(
    node: roxmltree::Node<'_, '_>,
    block_root: roxmltree::Node<'_, '_>,
    chapter_path: &str,
    readable_documents: &HashMap<String, String>,
    chapter_ids_by_path: &HashMap<String, String>,
    text: &mut String,
    annotations: &mut Vec<ResolvedAnnotation>,
) {
    if should_skip_text_node(node) {
        return;
    }
    if block_root.tag_name().name() == "li"
        && node != block_root
        && node.is_element()
        && matches!(node.tag_name().name(), "ol" | "ul")
    {
        return;
    }
    if node.is_element() && node.tag_name().name() == "a" {
        if let Some(reference) = resolve_reference(node, chapter_path, readable_documents) {
            let index = annotations.len();
            annotations.push(ResolvedAnnotation::Reference(reference));
            text.push_str(&format!("\u{e000}{index}\u{e001}"));
            return;
        }
        if let Some(link) = resolve_external_link(node) {
            let index = annotations.len();
            annotations.push(ResolvedAnnotation::Link(link));
            text.push_str(&format!("\u{e000}{index}\u{e001}"));
            return;
        }
        if let Some(link) =
            resolve_internal_link(node, chapter_path, readable_documents, chapter_ids_by_path)
        {
            let index = annotations.len();
            annotations.push(ResolvedAnnotation::Link(link));
            text.push_str(&format!("\u{e000}{index}\u{e001}"));
            return;
        }
    }
    if node.is_text() {
        if let Some(value) = node.text() {
            text.push(' ');
            text.push_str(value);
        }
    }
    for child in node.children() {
        collect_annotated_text(
            child,
            block_root,
            chapter_path,
            readable_documents,
            chapter_ids_by_path,
            text,
            annotations,
        );
    }
}

enum ResolvedAnnotation {
    Reference(ResolvedReference),
    Link(ResolvedLink),
}

struct ResolvedLink {
    label: String,
    href: Option<String>,
    target_chapter_id: Option<String>,
    target_text: Option<String>,
}

fn resolve_external_link(anchor: roxmltree::Node<'_, '_>) -> Option<ResolvedLink> {
    let href = anchor.attribute("href")?.trim();
    let scheme = href.split_once(':')?.0.to_ascii_lowercase();
    if !matches!(scheme.as_str(), "http" | "https" | "mailto") || href.chars().any(char::is_control)
    {
        return None;
    }
    let label = normalize_reader_text(&node_text(anchor));
    (!label.is_empty()).then_some(ResolvedLink {
        label,
        href: Some(href.to_string()),
        target_chapter_id: None,
        target_text: None,
    })
}

fn resolve_internal_link(
    anchor: roxmltree::Node<'_, '_>,
    chapter_path: &str,
    readable_documents: &HashMap<String, String>,
    chapter_ids_by_path: &HashMap<String, String>,
) -> Option<ResolvedLink> {
    let href = anchor.attribute("href")?.trim();
    if href.is_empty() || href.contains(':') {
        return None;
    }
    let (path, fragment) = href.split_once('#').unwrap_or((href, ""));
    let target_path = if path.is_empty() {
        chapter_path.to_string()
    } else {
        normalize_epub_path(&epub_parent(chapter_path), path)
    };
    let target_chapter_id = chapter_ids_by_path.get(&target_path)?.clone();
    let target_text = if fragment.is_empty() {
        None
    } else {
        let target_xml = readable_documents.get(&target_path)?;
        let document = parse_epub_xml(target_xml).ok()?;
        let target_id = percent_decode_path(fragment);
        let target = document
            .descendants()
            .find(|node| node.attribute("id") == Some(target_id.as_str()))?;
        let heading = target
            .descendants()
            .find(|node| matches!(node.tag_name().name(), "h1" | "h2" | "h3" | "h4"));
        let text = normalize_reader_text(&node_text(heading.unwrap_or(target)));
        (!text.is_empty()).then_some(text)
    };
    let label = normalize_reader_text(&node_text(anchor));
    (!label.is_empty()).then_some(ResolvedLink {
        label,
        href: None,
        target_chapter_id: Some(target_chapter_id),
        target_text,
    })
}

struct ResolvedReference {
    marker: String,
    kind: String,
    content: String,
}

fn resolve_reference(
    anchor: roxmltree::Node<'_, '_>,
    chapter_path: &str,
    readable_documents: &HashMap<String, String>,
) -> Option<ResolvedReference> {
    let href = anchor.attribute("href")?;
    let (path, fragment) = href.split_once('#')?;
    if fragment.is_empty() {
        return None;
    }
    let target_path = if path.is_empty() {
        chapter_path.to_string()
    } else {
        normalize_epub_path(&epub_parent(chapter_path), path)
    };
    let target_xml = readable_documents.get(&target_path)?;
    let target_document = parse_epub_xml(target_xml).ok()?;
    let target_id = percent_decode_path(fragment);
    let target = target_document
        .descendants()
        .find(|node| node.attribute("id") == Some(target_id.as_str()))?;
    let content = normalize_reader_text(&reference_target_text(target));
    if content.is_empty() {
        return None;
    }
    let marker = normalize_reader_text(&node_text(anchor));
    let kind = reference_kind(anchor, target)
        .or_else(|| infer_legacy_reference_kind(anchor, &marker, &target_path))?;

    Some(ResolvedReference {
        marker: if marker.is_empty() {
            "Note".to_string()
        } else {
            marker
        },
        kind,
        content,
    })
}

fn infer_legacy_reference_kind(
    anchor: roxmltree::Node<'_, '_>,
    marker: &str,
    target_path: &str,
) -> Option<String> {
    let path = target_path.to_ascii_lowercase();
    if path.contains("biblio") || path.contains("citation") || path.contains("reference") {
        return Some("citation".to_string());
    }
    if path.contains("endnote") {
        return Some("endnote".to_string());
    }
    if path.contains("footnote") || path.contains("notes") {
        return Some("footnote".to_string());
    }

    let compact_marker = marker.chars().count() <= 8
        && marker
            .chars()
            .all(|character| character.is_ascii_digit() || "[]()*†‡".contains(character));
    let superscript = anchor
        .descendants()
        .any(|node| matches!(node.tag_name().name(), "sup" | "sub"));
    (compact_marker && superscript).then(|| "footnote".to_string())
}

fn reference_kind(
    anchor: roxmltree::Node<'_, '_>,
    target: roxmltree::Node<'_, '_>,
) -> Option<String> {
    for (token, kind) in [
        ("footnote", "footnote"),
        ("endnote", "endnote"),
        ("rearnote", "endnote"),
        ("citation", "citation"),
        ("biblioref", "citation"),
        ("noteref", "footnote"),
        ("note", "note"),
    ] {
        if has_epub_type(&anchor, token) || has_epub_type(&target, token) {
            return Some(kind.to_string());
        }
    }
    (target.tag_name().name() == "aside").then(|| "note".to_string())
}

fn reference_target_text(target: roxmltree::Node<'_, '_>) -> String {
    let mut text = String::new();
    collect_reference_text(target, &mut text);
    text
}

fn collect_reference_text(node: roxmltree::Node<'_, '_>, text: &mut String) {
    if node.is_element() && node.tag_name().name() == "a" && has_epub_type(&node, "backlink") {
        return;
    }
    if node.is_text() {
        if let Some(value) = node.text() {
            text.push(' ');
            text.push_str(value);
        }
    }
    for child in node.children() {
        collect_reference_text(child, text);
    }
}

fn first_heading(document: &roxmltree::Document<'_>) -> Option<String> {
    ["h1", "h2"]
        .iter()
        .find_map(|tag| first_text(document, tag))
}

fn parse_epub_xml(xml: &str) -> Result<roxmltree::Document<'_>, roxmltree::Error> {
    roxmltree::Document::parse_with_options(
        xml,
        roxmltree::ParsingOptions {
            allow_dtd: true,
            ..roxmltree::ParsingOptions::default()
        },
    )
}

fn first_text(document: &roxmltree::Document<'_>, tag: &str) -> Option<String> {
    document
        .descendants()
        .find(|node| node.tag_name().name() == tag)
        .map(node_text)
        .map(|text| normalize_reader_text(&text))
        .filter(|text| !text.is_empty())
}

fn collect_reading_block_nodes<'a, 'input>(
    root: roxmltree::Node<'a, 'input>,
) -> Vec<roxmltree::Node<'a, 'input>> {
    root.descendants()
        .filter(|node| node.is_element())
        .filter(|node| is_reading_block(*node))
        .filter(|node| !should_skip_text_node(*node))
        .filter(|node| node.tag_name().name() == "li" || !has_reading_block_ancestor(*node, root))
        .collect()
}

fn is_reading_block(node: roxmltree::Node<'_, '_>) -> bool {
    matches!(
        node.tag_name().name(),
        "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "blockquote" | "pre"
    )
}

fn has_reading_block_ancestor(
    node: roxmltree::Node<'_, '_>,
    root: roxmltree::Node<'_, '_>,
) -> bool {
    node.ancestors()
        .take_while(|ancestor| *ancestor != root)
        .skip(1)
        .any(is_reading_block)
}

fn should_skip_text_node(node: roxmltree::Node<'_, '_>) -> bool {
    node.ancestors().any(|ancestor| {
        matches!(
            ancestor.tag_name().name(),
            "head" | "script" | "style" | "svg" | "nav"
        )
    })
}

fn node_text(node: roxmltree::Node<'_, '_>) -> String {
    let mut text = String::new();

    for descendant in node.descendants().filter(|descendant| descendant.is_text()) {
        if let Some(value) = descendant.text() {
            text.push(' ');
            text.push_str(value);
        }
    }

    text
}

fn read_zip_text<R: Read + Seek>(archive: &mut ZipArchive<R>, path: &str) -> Option<String> {
    let mut file = archive.by_name(path).ok()?;
    let mut text = String::new();
    file.read_to_string(&mut text).ok()?;
    Some(text)
}

fn read_zip_bytes<R: Read + Seek>(archive: &mut ZipArchive<R>, path: &str) -> Option<Vec<u8>> {
    let mut file = archive.by_name(path).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

fn epub_parent(path: &str) -> String {
    Path::new(path)
        .parent()
        .map(PathBuf::from)
        .unwrap_or_default()
        .to_string_lossy()
        .replace('\\', "/")
}

fn normalize_epub_path(base_dir: &str, href: &str) -> String {
    let href = strip_href_fragment(href);
    let joined = if base_dir.is_empty() {
        href.to_string()
    } else {
        format!("{base_dir}/{href}")
    };
    let decoded = percent_decode_path(&joined);
    let mut parts = Vec::new();

    for part in decoded.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }

    parts.join("/")
}

fn strip_href_fragment(href: &str) -> &str {
    href.split_once('#')
        .map(|(path, _fragment)| path)
        .unwrap_or(href)
}

fn percent_decode_path(path: &str) -> String {
    let bytes = path.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = hex_value(bytes[index + 1]);
            let low = hex_value(bytes[index + 2]);

            if let (Some(high), Some(low)) = (high, low) {
                output.push(high * 16 + low);
                index += 3;
                continue;
            }
        }

        output.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&output).into_owned()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn fallback_book_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.replace(['_', '-'], " "))
        .map(|stem| normalize_reader_text(&stem))
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| "Untitled Book".to_string())
}

fn hex_prefix(bytes: &[u8], length: usize) -> String {
    bytes
        .iter()
        .flat_map(|byte| [byte >> 4, byte & 0x0f])
        .take(length)
        .map(|nibble| char::from_digit(nibble.into(), 16).unwrap_or('0'))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        fs,
        io::{Seek, Write},
        path::{Path, PathBuf},
    };

    use chrono::Utc;
    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::{
        extract_chapter_heading, extract_chapter_text, find_package_path, import_epub_file,
        normalize_epub_path, parse_epub3_nav_titles, parse_ncx_titles, parse_package,
        read_epub_language, EpubStyles,
    };
    use crate::{library_import::prepare_epub_import, storage::SonelleStore};

    #[test]
    fn reads_indentation_and_emphasis_from_epub_class_styles() {
        let styles = EpubStyles::from_documents(&HashMap::from([(
            "EPUB/book.css".to_string(),
            ".child { margin: 0 0 0 1.1em; } .label { font-weight: bold; }".to_string(),
        )]));
        let document = super::parse_epub_xml(
            r#"<html><body><p class="child"><span class="label">Entry</span></p></body></html>"#,
        )
        .expect("style fixture should parse");
        let paragraph = document
            .descendants()
            .find(|node| node.tag_name().name() == "p")
            .expect("paragraph should exist");

        assert!((styles.margin_left_em(paragraph) - 1.1).abs() < f32::EPSILON);
        assert!(styles.is_bold(paragraph));
    }

    #[test]
    fn finds_the_package_path_from_container_xml() {
        let container = r#"<?xml version="1.0"?>
        <container>
          <rootfiles>
            <rootfile full-path="OPS/content.opf" />
          </rootfiles>
        </container>"#;

        assert_eq!(
            find_package_path(container).as_deref(),
            Some("OPS/content.opf")
        );
    }

    #[test]
    fn parses_metadata_manifest_and_spine() {
        let package = parse_package(
            r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
              <metadata><dc:title>Book</dc:title><dc:creator>Author</dc:creator><dc:language>fr-FR</dc:language></metadata>
              <manifest><item id="c1" href="chapters/one.xhtml" media-type="application/xhtml+xml"/></manifest>
              <spine><itemref idref="c1"/></spine>
            </package>"#,
            "OPS/content.opf",
        )
        .expect("package should parse");

        assert_eq!(package.title.as_deref(), Some("Book"));
        assert_eq!(package.author.as_deref(), Some("Author"));
        assert_eq!(package.language.as_deref(), Some("fr-FR"));
        assert_eq!(
            package.manifest.get("c1").map(|item| item.href.as_str()),
            Some("chapters/one.xhtml")
        );
        assert_eq!(package.spine[0].idref, "c1");
        assert!(package.spine[0].linear);
    }

    #[test]
    fn resolves_relative_epub_paths() {
        assert_eq!(
            normalize_epub_path("OPS/package", "../chapters/one.xhtml"),
            "OPS/chapters/one.xhtml"
        );
        assert_eq!(
            normalize_epub_path("OPS/package", "../chapters/one%20more.xhtml#part"),
            "OPS/chapters/one more.xhtml"
        );
        assert_eq!(
            normalize_epub_path("OPS/package", "../chapters/caf%C3%A9.xhtml"),
            "OPS/chapters/café.xhtml"
        );
    }

    #[test]
    fn extracts_visible_chapter_heading_before_document_title() {
        assert_eq!(
            extract_chapter_heading(
                "<html><head><title>Generic File Title</title></head><body><h2>Visible Chapter</h2></body></html>"
            )
            .as_deref(),
            Some("Visible Chapter")
        );
    }

    #[test]
    fn extracts_heading_text_after_inline_anchor() {
        assert_eq!(
            extract_chapter_heading(
                "<html><head><title>Repeated Book</title></head><body><h2><a id=\"chapter\"/>Actual Chapter</h2></body></html>"
            )
            .as_deref(),
            Some("Actual Chapter")
        );
    }

    #[test]
    fn extracts_normalized_chapter_text() {
        assert_eq!(
            extract_chapter_text(
                "<html><head><style>Ignore</style></head><body><nav>Skip me</nav><p>Hello</p><script>Nope</script><p>reader.</p></body></html>"
            ),
            "Hello\n\nreader."
        );
    }

    #[test]
    fn extracts_chapter_text_from_xhtml_with_doctype() {
        assert_eq!(
            extract_chapter_text(
                r#"<?xml version="1.0" encoding="utf-8"?>
                <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN"
                  "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
                <html xmlns="http://www.w3.org/1999/xhtml">
                  <body><h1>Introduction</h1><p>Readable text.</p></body>
                </html>"#
            ),
            "Introduction\n\nReadable text."
        );
    }

    #[test]
    fn parses_ncx_labels_by_resolved_content_path() {
        let titles = parse_ncx_titles(
            r#"<ncx>
              <navMap>
                <navPoint>
                  <navLabel><text>Deep Chapter</text></navLabel>
                  <content src="../text/deep.xhtml#start" />
                </navPoint>
              </navMap>
            </ncx>"#,
            "OPS/nav/toc.ncx",
        );

        assert_eq!(
            titles.get("OPS/text/deep.xhtml").map(String::as_str),
            Some("Deep Chapter")
        );
    }

    #[test]
    fn parses_ncx_labels_with_doctype_and_namespace() {
        let titles = parse_ncx_titles(
            r#"<?xml version="1.0"?>
            <!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
            <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
              <navMap>
                <navPoint>
                  <navLabel><text>Namespaced Chapter</text></navLabel>
                  <content src="chapter.xhtml" />
                </navPoint>
              </navMap>
            </ncx>"#,
            "OPS/toc.ncx",
        );

        assert_eq!(
            titles.get("OPS/chapter.xhtml").map(String::as_str),
            Some("Namespaced Chapter")
        );
    }

    #[test]
    fn keeps_first_navigation_label_for_split_files_with_fragments() {
        let titles = parse_ncx_titles(
            r#"<ncx>
              <navMap>
                <navPoint>
                  <navLabel><text>About the Author</text></navLabel>
                  <content src="front.xhtml" />
                </navPoint>
                <navPoint>
                  <navLabel><text>Copyright Page</text></navLabel>
                  <content src="front.xhtml#copyright" />
                </navPoint>
              </navMap>
            </ncx>"#,
            "OPS/toc.ncx",
        );

        assert_eq!(
            titles.get("OPS/front.xhtml").map(String::as_str),
            Some("About the Author")
        );
    }

    #[test]
    fn parses_epub3_toc_without_landmark_overrides() {
        let titles = parse_epub3_nav_titles(
            r#"<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
              <body>
                <nav epub:type="toc">
                  <ol><li><a href="../text/chapter.xhtml">Chapter Label</a></li></ol>
                </nav>
                <nav epub:type="landmarks">
                  <ol><li><a href="../text/chapter.xhtml">Start Reading</a></li></ol>
                </nav>
              </body>
            </html>"#,
            "OPS/nav/nav.xhtml",
        );

        assert_eq!(
            titles.get("OPS/text/chapter.xhtml").map(String::as_str),
            Some("Chapter Label")
        );
    }

    #[test]
    fn imports_sparse_nested_epub_with_navigation_titles_and_mixed_html() {
        let temp_dir = temp_epub_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let epub_path = temp_dir.join("Sparse_Book.epub");
        write_epub(
            &epub_path,
            [
                (
                    "META-INF/container.xml",
                    r#"<?xml version="1.0"?>
                    <container>
                      <rootfiles>
                        <rootfile full-path="OPS/package/content.opf" />
                      </rootfiles>
                    </container>"#,
                ),
                (
                    "OPS/package/content.opf",
                    r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <metadata><dc:language>fr</dc:language></metadata>
                      <manifest>
                        <item id="nav" href="../nav/nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
                        <item id="c1" href="../Text/intro.htm" media-type="text/html" />
                        <item id="skip" href="../Text/skip.xhtml" media-type="application/xhtml+xml" />
                        <item id="c2" href="../Text/encoded%20chapter.xhtml" media-type="application/xhtml+xml" />
                      </manifest>
                      <spine>
                        <itemref idref="c1" />
                        <itemref idref="skip" linear="no" />
                        <itemref idref="c2" />
                      </spine>
                    </package>"#,
                ),
                (
                    "OPS/nav/nav.xhtml",
                    r#"<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
                      <body>
                        <nav epub:type="toc">
                          <ol>
                            <li><a href="../Text/intro.htm">Opening From Nav</a></li>
                            <li><a href="../Text/encoded%20chapter.xhtml#part">Encoded Path</a></li>
                          </ol>
                        </nav>
                      </body>
                    </html>"#,
                ),
                (
                    "OPS/Text/intro.htm",
                    r#"<html><body>
                      <nav>This should not be read.</nav>
                      <p>Hello <span>reader</span>.</p>
                      <script>Also skipped.</script>
                    </body></html>"#,
                ),
                (
                    "OPS/Text/skip.xhtml",
                    r#"<html><body><p>Linear no should stay out.</p></body></html>"#,
                ),
                (
                    "OPS/Text/encoded chapter.xhtml",
                    r#"<html><body><p>Second readable chapter.</p></body></html>"#,
                ),
            ],
        );

        let book = import_epub_file(&epub_path).expect("epub should import");

        assert_eq!(book.title, "Sparse Book");
        assert_eq!(book.author, "Unknown author");
        assert_eq!(book.language.as_deref(), Some("fr"));
        assert_eq!(read_epub_language(&epub_path).as_deref(), Some("fr"));
        assert_eq!(book.chapters.len(), 2);
        assert_eq!(book.chapters[0].title, "Opening From Nav");
        assert_eq!(book.chapters[0].body, "Hello reader.");
        assert_eq!(book.chapters[1].title, "Encoded Path");
        assert_eq!(book.chapters[1].body, "Second readable chapter.");

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn imports_cross_document_epub_footnotes_without_polluting_reading_text() {
        let temp_dir = temp_epub_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let epub_path = temp_dir.join("References.epub");
        write_epub(
            &epub_path,
            [
                (
                    "META-INF/container.xml",
                    r#"<container><rootfiles><rootfile full-path="EPUB/content.opf" /></rootfiles></container>"#,
                ),
                (
                    "EPUB/content.opf",
                    r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <metadata><dc:title>References</dc:title></metadata>
                      <manifest>
                        <item id="c1" href="text/chapter.xhtml" media-type="application/xhtml+xml" />
                        <item id="notes" href="notes.xhtml" media-type="application/xhtml+xml" />
                      </manifest>
                      <spine><itemref idref="c1" /><itemref idref="notes" linear="no" /></spine>
                    </package>"#,
                ),
                (
                    "EPUB/text/chapter.xhtml",
                    r#"<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
                      <p>A careful claim<a epub:type="noteref" href="../notes.xhtml#note-1">1</a> continues.</p>
                      <p>A legacy claim<a href="../notes.xhtml#note-2"><sup>2</sup></a> remains readable.</p>
                    </body></html>"#,
                ),
                (
                    "EPUB/notes.xhtml",
                    r#"<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
                      <aside id="note-1" epub:type="footnote"><p>The source explains the claim.</p></aside>
                      <p id="note-2">An older EPUB note without semantic attributes.</p>
                    </body></html>"#,
                ),
            ],
        );

        let book = import_epub_file(&epub_path).expect("epub should import");
        let chapter = &book.chapters[0];

        assert_eq!(
            chapter.body,
            "A careful claim continues.\n\nA legacy claim remains readable."
        );
        assert_eq!(chapter.references.len(), 2);
        assert_eq!(chapter.references[0].marker, "1");
        assert_eq!(chapter.references[0].kind, "footnote");
        assert_eq!(
            chapter.references[0].content,
            "The source explains the claim."
        );
        assert_eq!(chapter.references[1].marker, "2");
        assert_eq!(chapter.references[1].kind, "footnote");
        assert_eq!(
            chapter.references[1].content,
            "An older EPUB note without semantic attributes."
        );

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn imports_safe_external_links_without_losing_their_reading_text() {
        let temp_dir = temp_epub_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let epub_path = temp_dir.join("Links.epub");
        write_epub(
            &epub_path,
            [
                (
                    "META-INF/container.xml",
                    r#"<container><rootfiles><rootfile full-path="EPUB/content.opf" /></rootfiles></container>"#,
                ),
                (
                    "EPUB/content.opf",
                    r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <metadata><dc:title>Linked reading</dc:title></metadata>
                      <manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml" /></manifest>
                      <spine><itemref idref="c1" /></spine>
                    </package>"#,
                ),
                (
                    "EPUB/chapter.xhtml",
                    r#"<html><body><p>Visit the <a href="https://example.com/ai?source=book&amp;mode=reader">AI archive</a>, but keep <a href="javascript:alert('nope')">unsafe text</a> readable.</p></body></html>"#,
                ),
            ],
        );

        let book = import_epub_file(&epub_path).expect("epub should import");
        let chapter = &book.chapters[0];

        assert_eq!(
            chapter.body,
            "Visit the AI archive, but keep unsafe text readable."
        );
        assert_eq!(chapter.links.len(), 1);
        assert_eq!(
            chapter.links[0].href.as_deref(),
            Some("https://example.com/ai?source=book&mode=reader")
        );
        assert_eq!(
            &chapter.body
                [chapter.links[0].offset..chapter.links[0].offset + chapter.links[0].length],
            "AI archive"
        );

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn resolves_internal_contents_links_to_reader_chapters() {
        let temp_dir = temp_epub_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let epub_path = temp_dir.join("Contents.epub");
        write_epub(
            &epub_path,
            [
                (
                    "META-INF/container.xml",
                    r#"<container><rootfiles><rootfile full-path="EPUB/content.opf" /></rootfiles></container>"#,
                ),
                (
                    "EPUB/content.opf",
                    r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <metadata><dc:title>Linked contents</dc:title></metadata>
                      <manifest>
                        <item id="contents" href="contents.xhtml" media-type="application/xhtml+xml" />
                        <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" />
                        <item id="styles" href="book.css" media-type="text/css" />
                      </manifest>
                      <spine><itemref idref="contents" /><itemref idref="chapter" /></spine>
                    </package>"#,
                ),
                (
                    "EPUB/contents.xhtml",
                    r#"<html><head><link href="book.css" rel="stylesheet" /></head><body>
                      <p class="group"><a href="chapter.xhtml"><span class="group-label">PART I</span></a></p>
                      <p class="child"><a href="chapter.xhtml#part-two">Continue to Part Two</a></p>
                      <ol start="3">
                        <li>First listed topic.<ol><li>Nested topic.</li></ol></li>
                        <li>Second listed topic.</li>
                      </ol>
                    </body></html>"#,
                ),
                (
                    "EPUB/chapter.xhtml",
                    r#"<html><body><p>Opening context.</p><h2 id="part-two">Part Two</h2><p>The destination text.</p></body></html>"#,
                ),
                (
                    "EPUB/book.css",
                    ".group { margin: 0.5em 0 0 0; }\n.child { margin: 0 0 0 1.1em; }\n.group-label { font-weight: bold; }",
                ),
            ],
        );

        let book = import_epub_file(&epub_path).expect("epub should import");
        let link = &book.chapters[0].links[1];

        assert_eq!(link.href, None);
        assert_eq!(
            link.target_chapter_id.as_deref(),
            Some(book.chapters[1].id.as_str())
        );
        assert_eq!(link.target_text.as_deref(), Some("Part Two"));
        assert_eq!(book.chapters[0].presentations.len(), 5);
        assert_eq!(book.chapters[0].presentations[0].kind, "navigation");
        assert_eq!(book.chapters[0].presentations[0].indent_level, 0);
        assert!(
            book.chapters[0].presentations[0].emphasized,
            "presentations={:?}",
            book.chapters[0].presentations
        );
        assert_eq!(book.chapters[0].presentations[1].indent_level, 1);
        assert!(!book.chapters[0].presentations[1].emphasized);
        assert_eq!(book.chapters[0].presentations[2].kind, "ordered");
        assert_eq!(
            book.chapters[0].presentations[2].marker.as_deref(),
            Some("3")
        );
        assert_eq!(book.chapters[0].presentations[3].indent_level, 1);
        assert_eq!(
            book.chapters[0].presentations[3].marker.as_deref(),
            Some("1")
        );
        assert_eq!(
            book.chapters[0].presentations[4].marker.as_deref(),
            Some("4")
        );
        assert_eq!(
            book.chapters[0].body,
            "PART I\n\nContinue to Part Two\n\nFirst listed topic.\n\nNested topic.\n\nSecond listed topic."
        );

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn imports_navigation_title_before_repeated_document_heading() {
        let temp_dir = temp_epub_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let epub_path = temp_dir.join("Repeated_Title.epub");
        write_epub(
            &epub_path,
            [
                (
                    "META-INF/container.xml",
                    r#"<?xml version="1.0"?>
                    <container>
                      <rootfiles>
                        <rootfile full-path="OPS/content.opf" />
                      </rootfiles>
                    </container>"#,
                ),
                (
                    "OPS/content.opf",
                    r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <metadata><dc:title>Repeated Book</dc:title></metadata>
                      <manifest>
                        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
                        <item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml" />
                      </manifest>
                      <spine toc="ncx"><itemref idref="c1" /></spine>
                    </package>"#,
                ),
                (
                    "OPS/toc.ncx",
                    r#"<ncx>
                      <navMap>
                        <navPoint>
                          <navLabel><text>Actual Chapter Name</text></navLabel>
                          <content src="text/one.xhtml#start" />
                        </navPoint>
                      </navMap>
                    </ncx>"#,
                ),
                (
                    "OPS/text/one.xhtml",
                    r#"<html><head><title>Repeated Book</title></head><body>
                      <h1>Repeated Book</h1>
                      <p>Readable chapter text.</p>
                    </body></html>"#,
                ),
            ],
        );

        let book = import_epub_file(&epub_path).expect("epub should import");

        assert_eq!(book.chapters[0].title, "Actual Chapter Name");

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn imports_epub2_metadata_cover_image() {
        let temp_dir = temp_epub_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let epub_path = temp_dir.join("Covered_Book.epub");
        write_epub(
            &epub_path,
            [
                (
                    "META-INF/container.xml",
                    r#"<?xml version="1.0"?>
                    <container>
                      <rootfiles>
                        <rootfile full-path="OPS/content.opf" />
                      </rootfiles>
                    </container>"#,
                ),
                (
                    "OPS/content.opf",
                    r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <metadata>
                        <dc:title>Covered Book</dc:title>
                        <meta name="cover" content="cover-jpg" />
                      </metadata>
                      <manifest>
                        <item id="cover-jpg" href="images/cover.jpg" media-type="image/jpeg" />
                        <item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml" />
                      </manifest>
                      <spine><itemref idref="c1" /></spine>
                    </package>"#,
                ),
                ("OPS/images/cover.jpg", "fake-cover"),
                (
                    "OPS/text/one.xhtml",
                    r#"<html><body><p>Readable covered chapter.</p></body></html>"#,
                ),
            ],
        );

        let book = import_epub_file(&epub_path).expect("epub should import");

        let cover = book.cover_image.expect("cover should import");
        assert_eq!(cover.media_type, "image/jpeg");
        assert_eq!(cover.bytes, b"fake-cover");

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn imports_epub3_manifest_cover_image() {
        let temp_dir = temp_epub_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let epub_path = temp_dir.join("Manifest_Cover.epub");
        write_epub(
            &epub_path,
            [
                (
                    "META-INF/container.xml",
                    r#"<?xml version="1.0"?>
                    <container>
                      <rootfiles>
                        <rootfile full-path="EPUB/content.opf" />
                      </rootfiles>
                    </container>"#,
                ),
                (
                    "EPUB/content.opf",
                    r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <metadata><dc:title>Manifest Cover</dc:title></metadata>
                      <manifest>
                        <item id="cover" href="assets/front.png" media-type="image/png" properties="cover-image" />
                        <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml" />
                      </manifest>
                      <spine><itemref idref="c1" /></spine>
                    </package>"#,
                ),
                ("EPUB/assets/front.png", "png-cover"),
                (
                    "EPUB/chapter.xhtml",
                    r#"<html><body><p>Readable manifest chapter.</p></body></html>"#,
                ),
            ],
        );

        let book = import_epub_file(&epub_path).expect("epub should import");

        let cover = book.cover_image.expect("cover should import");
        assert_eq!(cover.media_type, "image/png");
        assert_eq!(cover.bytes, b"png-cover");

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn imports_a_representative_managed_epub_into_the_mobile_library() {
        let temp_dir = temp_epub_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let epub_path = temp_dir.join("managed-source.epub");
        write_epub(
            &epub_path,
            [
                (
                    "META-INF/container.xml",
                    r#"<?xml version="1.0"?>
                    <container>
                      <rootfiles><rootfile full-path="EPUB/content.opf" /></rootfiles>
                    </container>"#,
                ),
                (
                    "EPUB/content.opf",
                    r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <metadata>
                        <dc:title>Pocket Reading</dc:title>
                        <dc:creator>Sonelle</dc:creator>
                        <dc:language>en</dc:language>
                      </metadata>
                      <manifest>
                        <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml" />
                      </manifest>
                      <spine><itemref idref="c1" /></spine>
                    </package>"#,
                ),
                (
                    "EPUB/chapter.xhtml",
                    r#"<html><body><h1>A Small Chapter</h1><p>First sentence. Second sentence.</p></body></html>"#,
                ),
            ],
        );
        let store = SonelleStore::open_at(temp_dir.join("sonelle.sqlite3"))
            .expect("mobile library should initialize");

        let prepared = prepare_epub_import(&epub_path).expect("managed EPUB should parse");
        let saved = store
            .save_imported_book(prepared)
            .expect("managed EPUB should commit atomically");
        let listed = store.list_books().expect("mobile library should refresh");
        let reopened = store
            .open_book(&saved.book.id, None)
            .expect("imported book should open immediately");

        assert_eq!(saved.book.title, "Pocket Reading");
        assert_eq!(saved.book.author, "Sonelle");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].chapter_count, 1);
        assert_eq!(reopened.chapters[0].title, "A Small Chapter");
        assert_eq!(reopened.chapters[0].sentences.len(), 3);
        assert_eq!(reopened.chapters[0].sentences[1].text, "First sentence.");

        fs::remove_dir_all(temp_dir).ok();
    }

    fn write_epub<const N: usize>(path: &Path, entries: [(&str, &str); N]) {
        let file = fs::File::create(path).expect("epub file should be created");
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        for (name, contents) in entries {
            writer
                .start_file(name, options)
                .expect("zip entry should start");
            writer
                .write_all(contents.as_bytes())
                .expect("zip entry should be written");
        }

        finish_zip(writer);
    }

    fn finish_zip<W: Write + Seek>(writer: ZipWriter<W>) {
        writer.finish().expect("zip should finish");
    }

    fn temp_epub_dir() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sonelle-epub-import-test-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }
}
