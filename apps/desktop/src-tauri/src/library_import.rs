use std::{collections::HashMap, path::Path};

use crate::{
    epub_import::{
        import_epub_file, ImportError, ImportedBook, ImportedCover, ImportedLink, ImportedReference,
    },
    text::segment_normalized_paragraphs,
};

#[derive(Debug, Clone)]
pub struct PreparedBookImport {
    pub id: String,
    pub title: String,
    pub author: String,
    pub language: Option<String>,
    pub cover_image: Option<ImportedCover>,
    pub source_path: String,
    pub chapters: Vec<PreparedChapterImport>,
}

#[derive(Debug, Clone)]
pub struct PreparedChapterImport {
    pub id: String,
    pub title: String,
    pub index: usize,
    pub body: String,
    pub sentences: Vec<PreparedSentenceImport>,
    pub paragraphs: Vec<PreparedParagraphImport>,
    pub references: Vec<PreparedReferenceImport>,
    pub links: Vec<PreparedLinkImport>,
    pub presentations: Vec<PreparedParagraphPresentation>,
}

#[derive(Debug, Clone)]
pub struct PreparedSentenceImport {
    pub id: String,
    pub index: usize,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct PreparedParagraphImport {
    pub id: String,
    pub index: usize,
    pub start_sentence_index: usize,
    pub sentence_count: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedParagraphPresentation {
    pub index: usize,
    pub kind: String,
    pub indent_level: usize,
    pub marker: Option<String>,
    pub emphasized: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedReferenceImport {
    pub id: String,
    pub sentence_id: String,
    pub sentence_index: usize,
    pub offset: usize,
    pub marker: String,
    pub kind: String,
    pub content: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedLinkImport {
    pub id: String,
    pub sentence_id: String,
    pub sentence_index: usize,
    pub offset: usize,
    pub length: usize,
    pub href: Option<String>,
    pub target_chapter_id: Option<String>,
    pub target_sentence_index: Option<usize>,
}

pub fn prepare_epub_import(path: &Path) -> Result<PreparedBookImport, ImportError> {
    import_epub_file(path).map(prepare_imported_book)
}

pub fn prepare_imported_book(book: ImportedBook) -> PreparedBookImport {
    let prepared_chapter_texts = book
        .chapters
        .iter()
        .map(|chapter| {
            (
                chapter.id.clone(),
                prepare_chapter_text(&chapter.id, &chapter.body),
            )
        })
        .collect::<HashMap<_, _>>();
    PreparedBookImport {
        id: book.id,
        title: book.title,
        author: book.author,
        language: book.language,
        cover_image: book.cover_image,
        source_path: book.source_path,
        chapters: book
            .chapters
            .into_iter()
            .map(|chapter| {
                let (sentences, paragraphs) = prepared_chapter_texts
                    .get(&chapter.id)
                    .cloned()
                    .unwrap_or_default();
                let references = prepare_references(&chapter.body, &chapter.references, &sentences);
                let links = prepare_links(
                    &chapter.body,
                    &chapter.links,
                    &sentences,
                    &prepared_chapter_texts,
                );

                PreparedChapterImport {
                    id: chapter.id,
                    title: chapter.title,
                    index: chapter.index,
                    body: chapter.body,
                    sentences,
                    paragraphs,
                    references,
                    links,
                    presentations: chapter
                        .presentations
                        .into_iter()
                        .map(|presentation| PreparedParagraphPresentation {
                            index: presentation.index,
                            kind: presentation.kind,
                            indent_level: presentation.indent_level,
                            marker: presentation.marker,
                            emphasized: presentation.emphasized,
                        })
                        .collect(),
                }
            })
            .collect(),
    }
}

fn prepare_links(
    body: &str,
    links: &[ImportedLink],
    sentences: &[PreparedSentenceImport],
    prepared_chapters: &HashMap<
        String,
        (Vec<PreparedSentenceImport>, Vec<PreparedParagraphImport>),
    >,
) -> Vec<PreparedLinkImport> {
    let sentence_ranges = sentence_ranges(body, sentences);
    links
        .iter()
        .filter_map(|link| {
            let link_end = link.offset.checked_add(link.length)?;
            let (sentence, start, _end) = sentence_ranges
                .iter()
                .find(|(_, start, end)| link.offset >= *start && link_end <= *end)?;
            Some(PreparedLinkImport {
                id: link.id.clone(),
                sentence_id: sentence.id.clone(),
                sentence_index: sentence.index,
                offset: body[*start..link.offset].encode_utf16().count(),
                length: body[link.offset..link_end].encode_utf16().count(),
                href: link.href.clone(),
                target_chapter_id: link.target_chapter_id.clone(),
                target_sentence_index: link.target_chapter_id.as_ref().map(|chapter_id| {
                    let target_sentences = prepared_chapters
                        .get(chapter_id)
                        .map(|(sentences, _)| sentences.as_slice())
                        .unwrap_or_default();
                    link.target_text
                        .as_deref()
                        .and_then(|target| {
                            target_sentences.iter().find(|sentence| {
                                sentence.text.contains(target) || target.contains(&sentence.text)
                            })
                        })
                        .map(|sentence| sentence.index)
                        .unwrap_or(0)
                }),
            })
        })
        .collect()
}

fn sentence_ranges<'a>(
    body: &str,
    sentences: &'a [PreparedSentenceImport],
) -> Vec<(&'a PreparedSentenceImport, usize, usize)> {
    let mut sentence_start = 0;
    sentences
        .iter()
        .filter_map(|sentence| {
            let relative = body[sentence_start..].find(&sentence.text)?;
            let start = sentence_start + relative;
            let end = start + sentence.text.len();
            sentence_start = end;
            Some((sentence, start, end))
        })
        .collect()
}

fn prepare_references(
    body: &str,
    references: &[ImportedReference],
    sentences: &[PreparedSentenceImport],
) -> Vec<PreparedReferenceImport> {
    let sentence_ranges = sentence_ranges(body, sentences);

    references
        .iter()
        .filter_map(|reference| {
            let (sentence, start, end) = sentence_ranges
                .iter()
                .find(|(_, start, end)| reference.offset >= *start && reference.offset <= *end)
                .or_else(|| {
                    sentence_ranges
                        .iter()
                        .rev()
                        .find(|(_, _, end)| *end <= reference.offset)
                })?;
            let reference_offset = reference.offset.clamp(*start, *end);
            let offset = body[*start..reference_offset].encode_utf16().count();
            Some(PreparedReferenceImport {
                id: reference.id.clone(),
                sentence_id: sentence.id.clone(),
                sentence_index: sentence.index,
                offset,
                marker: reference.marker.clone(),
                kind: reference.kind.clone(),
                content: reference.content.clone(),
            })
        })
        .collect()
}

pub fn prepare_legacy_paragraphs(chapter_id: &str, body: &str) -> Vec<PreparedParagraphImport> {
    prepare_chapter_text(chapter_id, body).1
}

fn prepare_chapter_text(
    chapter_id: &str,
    body: &str,
) -> (Vec<PreparedSentenceImport>, Vec<PreparedParagraphImport>) {
    let mut sentences = Vec::new();
    let mut paragraphs = Vec::new();
    for (paragraph_index, paragraph) in segment_normalized_paragraphs(body).into_iter().enumerate()
    {
        let start_sentence_index = sentences.len();
        for text in paragraph {
            let index = sentences.len();
            sentences.push(PreparedSentenceImport {
                id: format!("{chapter_id}:sentence-{}", index + 1),
                index,
                text,
            });
        }
        let sentence_count = sentences.len() - start_sentence_index;
        if sentence_count > 0 {
            paragraphs.push(PreparedParagraphImport {
                id: format!("{chapter_id}:paragraph-{}", paragraph_index + 1),
                index: paragraph_index,
                start_sentence_index,
                sentence_count,
            });
        }
    }
    (sentences, paragraphs)
}

impl From<ImportedBook> for PreparedBookImport {
    fn from(book: ImportedBook) -> Self {
        prepare_imported_book(book)
    }
}

#[cfg(test)]
mod tests {
    use crate::epub_import::{ImportedBook, ImportedChapter, ImportedLink, ImportedReference};

    use super::prepare_imported_book;

    #[test]
    fn prepares_sentence_and_paragraph_projections_before_storage() {
        let prepared = prepare_imported_book(ImportedBook {
            id: "book-1".to_string(),
            title: "A Book".to_string(),
            author: "A Writer".to_string(),
            language: Some("en".to_string()),
            cover_image: None,
            source_path: "/tmp/book.epub".to_string(),
            chapters: vec![
                ImportedChapter {
                    id: "chapter-1".to_string(),
                    title: "Chapter 1".to_string(),
                    index: 0,
                    body: "First sentence. Second sentence.\n\nThird sentence.".to_string(),
                    references: vec![ImportedReference {
                        id: "chapter-1:reference-1".to_string(),
                        offset: "First sentence.".len(),
                        marker: "1".to_string(),
                        kind: "footnote".to_string(),
                        content: "A useful note.".to_string(),
                    }],
                    links: vec![
                        ImportedLink {
                            id: "chapter-1:link-1".to_string(),
                            offset: "First ".len(),
                            length: "sentence".len(),
                            href: Some("https://example.com".to_string()),
                            target_chapter_id: None,
                            target_text: None,
                        },
                        ImportedLink {
                            id: "chapter-1:link-2".to_string(),
                            offset: "First sentence. ".len(),
                            length: "Second sentence".len(),
                            href: None,
                            target_chapter_id: Some("chapter-2".to_string()),
                            target_text: Some("Target section.".to_string()),
                        },
                    ],
                    presentations: Vec::new(),
                },
                ImportedChapter {
                    id: "chapter-2".to_string(),
                    title: "Chapter 2".to_string(),
                    index: 1,
                    body: "Preface.\n\nTarget section.\n\nMore reading.".to_string(),
                    references: Vec::new(),
                    links: Vec::new(),
                    presentations: Vec::new(),
                },
            ],
        });

        assert_eq!(prepared.chapters[0].sentences.len(), 3);
        assert_eq!(prepared.chapters[0].paragraphs.len(), 2);
        assert_eq!(prepared.chapters[0].paragraphs[1].start_sentence_index, 2);
        assert_eq!(prepared.chapters[0].references[0].sentence_index, 0);
        assert_eq!(
            prepared.chapters[0].references[0].offset,
            "First sentence.".len()
        );
        assert_eq!(prepared.chapters[0].links[0].sentence_index, 0);
        assert_eq!(prepared.chapters[0].links[0].offset, "First ".len());
        assert_eq!(prepared.chapters[0].links[0].length, "sentence".len());
        assert_eq!(
            prepared.chapters[0].links[1].target_chapter_id.as_deref(),
            Some("chapter-2")
        );
        assert_eq!(prepared.chapters[0].links[1].target_sentence_index, Some(1));
    }
}
