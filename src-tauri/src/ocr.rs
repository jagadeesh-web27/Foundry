//! OCR extension point.
//!
//! No OCR engine ships with Foundry today, so scanned PDFs, photos of documents, screenshots and
//! other image-only content are not searchable by their text. Foundry says this plainly through
//! `status()` rather than silently doing nothing or fabricating "recognized" text. `OcrEngine` is
//! a typed place for a future backend (Tesseract, an on-device vision model, ...) to plug into
//! without a rewrite of the extraction pipeline, and without ever claiming OCR is available when
//! it is not.

/// Image formats OCR would apply to. Distinct from `extract::is_extractable`, which covers
/// formats Foundry already reads text from directly (PDF, DOCX, plain text, ...).
const OCR_CANDIDATE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "tiff", "tif", "bmp", "heic", "webp"];

/// True when this file is the kind of thing OCR could help with (a photo or scan), regardless of
/// whether an OCR engine is actually installed.
pub fn is_ocr_candidate(ext: &str) -> bool {
    OCR_CANDIDATE_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

pub trait OcrEngine: Send + Sync {
    fn name(&self) -> &'static str;
    /// Recognize text in an image. `Ok(None)` means the image had no recognizable text.
    fn recognize(&self, image_bytes: &[u8]) -> Result<Option<String>, String>;
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct OcrStatus {
    pub available: bool,
    pub engine: Option<String>,
    pub reason: String,
}

/// Current OCR capability. Always honest: `available` is only ever true once a real `OcrEngine`
/// is wired in here, never a hardcoded guess.
pub fn status() -> OcrStatus {
    OcrStatus {
        available: false,
        engine: None,
        reason: "No OCR engine is installed yet, so scanned PDFs, photos of documents and \
                  screenshots with text in them are not searchable by their content."
            .to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_unavailable_honestly_with_no_engine_wired_in() {
        let s = status();
        assert!(!s.available);
        assert!(s.engine.is_none());
        assert!(!s.reason.is_empty());
        assert!(!s.reason.to_lowercase().contains("available"), "must not accidentally claim availability");
    }

    #[test]
    fn identifies_ocr_candidate_image_types() {
        assert!(is_ocr_candidate("png"));
        assert!(is_ocr_candidate("JPG"));
        assert!(is_ocr_candidate("heic"));
        assert!(!is_ocr_candidate("pdf"), "PDFs with a text layer already go through extract::extract_text");
        assert!(!is_ocr_candidate("docx"));
        assert!(!is_ocr_candidate("mp4"));
    }
}
