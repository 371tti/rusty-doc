use gray_matter::{engine::YAML, Matter};
use serde::Deserialize;

#[derive(Debug, Deserialize, Default, Clone)]
pub struct MdMeta {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub authors: Option<Vec<String>>,
    #[serde(default)]
    pub is_complete: bool,
    #[serde(default)]
    pub parse_err: Option<String>,
}

impl MdMeta {
    pub fn title(&self) -> String {
        match &self.title {
            Some(t) => t.clone(),
            None => "Untitled".to_string(),
        }
    }

    pub fn authors(&self) -> String {
        match &self.authors {
            Some(a) => a.join(", "),
            None => "Unknown".to_string(),
        }
    }
}

#[derive(Default, Clone)]
pub struct MarkdownService;

impl MarkdownService {
    pub fn parse_front_matter(&self, md: String, path: &[&str]) -> (MdMeta, String) {
        let matter = Matter::<YAML>::new();
        let result = matter.parse::<MdMeta>(&md);
        match result {
            Ok(data) => {
                if let Some(meta) = data.data {
                    (meta, data.content)
                } else {
                    (
                        MdMeta {
                            title: Some(path.last().unwrap_or(&"Untitled").to_string()),
                            is_complete: true,
                            ..Default::default()
                        },
                        data.content,
                    )
                }
            }
            Err(e) => (
                MdMeta {
                    parse_err: Some(format!("Failed to parse front matter: {}", e)),
                    title: Some(path.last().unwrap_or(&"Untitled").to_string()),
                    is_complete: false,
                    ..Default::default()
                },
                md,
            ),
        }
    }
}
