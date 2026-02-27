use crate::{markdown::MdMeta, render::MarkdownRenderer};

#[derive(Clone)]
pub struct TemplateService {
    renderer: MarkdownRenderer,
}

impl Default for TemplateService {
    fn default() -> Self {
        Self {
            renderer: MarkdownRenderer::default(),
        }
    }
}

impl TemplateService {
    pub fn render_common_page(&self, md: String, meta: MdMeta) -> String {
        let title = meta.title();
        let authors = meta.authors();
        let md = if meta.is_complete {
            md
        } else if meta.parse_err.is_none() {
            format!(
                ">[!Warning] This article is incomplete and may be subject to changes.\n\n{}",
                md
            )
        } else {
            format!(
                ">[!Warning] There was an error parsing the front matter: {}\n\n{}",
                meta.parse_err.unwrap_or_default(),
                md
            )
        };
        let content = self.renderer.render(&md);
        format!(
            include_str!("../../data/static/index.html"),
            title = title,
            authors = authors,
            content = content
        )
    }

    pub fn render_video_page(&self, url: &str) -> String {
        format!(include_str!("../../data/static/player.html"), url = url)
    }
}
