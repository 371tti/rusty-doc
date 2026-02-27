use std::sync::Arc;

use dashmap::DashMap;

use crate::{
    config::BASE_DIR,
    markdown::MarkdownService,
    web::api::{DocsRouter, LsAPI, LsResponse},
    web::templates::TemplateService,
};

#[derive(Clone)]
pub struct RustyDocContext {
    pub cache: Arc<DashMap<String, String>>,
    ls_api: LsAPI,
    docs_router: DocsRouter,
}

impl Default for RustyDocContext {
    fn default() -> Self {
        Self::new()
    }
}

impl RustyDocContext {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(DashMap::new()),
            ls_api: LsAPI::new(BASE_DIR),
            docs_router: DocsRouter::new(
                BASE_DIR,
                MarkdownService::default(),
                TemplateService::default(),
            ),
        }
    }

    pub fn cache_get(&self, key: &str) -> Option<String> {
        self.cache.get(key).map(|v| v.value().clone())
    }

    pub fn cache_set(&self, key: &str, value: String) {
        self.cache.insert(key.to_string(), value);
    }

    pub fn cache_purge(&self, key: &str) {
        self.cache.remove(key);
    }

    pub async fn docs_routing(&self, path: &[&str]) -> std::io::Result<Option<String>> {
        self.docs_router.route(path).await
    }

    pub async fn ls_routing(&self, path: &[&str]) -> std::io::Result<LsResponse> {
        self.ls_api.list(path).await
    }

}

