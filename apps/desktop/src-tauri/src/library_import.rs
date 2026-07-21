use std::path::Path;

use crate::{
    epub_import::{import_epub_file, ImportError, ImportedBook, ImportedCover, ImportedReference},
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
pub struct PreparedReferenceImport {
    pub id: String,
    pub sentence_id: String,
    pub sentence_index: usize,
    pub offset: usize,
    pub marker: String,
    pub kind: String,
    pub content: String,
}

pub fn prepare_epub_import(path: &Path) -> Result<PreparedBookImport, ImportError> {
    import_epub_file(path).map(prepare_imported_book)
}

pub fn prepare_imported_book(book: ImportedBook) -> PreparedBookImport {
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
                let (sentences, paragraphs) = prepare_chapter_text(&chapter.id, &chapter.body);
                let references = prepare_references(&chapter.body, &chapter.references, &sentences);

                PreparedChapterImport {
                    id: chapter.id,
                    title: chapter.title,
                    index: chapter.index,
                    body: chapter.body,
                    sentences,
                    paragraphs,
                    references,
                }
            })
            .collect(),
    }
}

fn prepare_references(
    body: &str,
    references: &[ImportedReference],
    sentences: &[PreparedSentenceImport],
) -> Vec<PreparedReferenceImport> {
    let mut sentence_start = 0;
    let sentence_ranges = sentences
        .iter()
        .filter_map(|sentence| {
            let relative = body[sentence_start..].find(&sentence.text)?;
            let start = sentence_start + relative;
            let end = start + sentence.text.len();
            sentence_start = end;
            Some((sentence, start, end))
        })
        .collect::<Vec<_>>();

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
    use crate::epub_import::{ImportedBook, ImportedChapter, ImportedReference};

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
            chapters: vec![ImportedChapter {
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
            }],
        });

        assert_eq!(prepared.chapters[0].sentences.len(), 3);
        assert_eq!(prepared.chapters[0].paragraphs.len(), 2);
        assert_eq!(prepared.chapters[0].paragraphs[1].start_sentence_index, 2);
        assert_eq!(prepared.chapters[0].references[0].sentence_index, 0);
        assert_eq!(
            prepared.chapters[0].references[0].offset,
            "First sentence.".len()
        );
    }
}
