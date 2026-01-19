
use std::sync::Arc;

use dashmap::DashMap;
use kurosabi::{connection::file::{DirEntryInfo, FileContentBuilder}, http::{HttpMethod, HttpStatusCode}, server::tokio::KurosabiTokioServerBuilder, utils::url_encode};
use rusty_doc::render::md_to_html_gfm_highlight;
use tf_idf_vectorizer::TFIDFVectorizer;
use tokio::{io::AsyncReadExt, sync::RwLock};

pub const BASE_DIR: &str = "./data/";

#[tokio::main]
async fn main() -> std::io::Result<()> {
    env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .init();
    KurosabiTokioServerBuilder::default()
        .bind([0, 0, 0, 0])
        .port(85)
        .router_and_build(|conn| async move {
            match conn.req.method() {
                HttpMethod::GET => {
                    match conn.path_segs().as_ref() {
                        ["raw", path @ ..] => {
                            let content = FileContentBuilder::base(BASE_DIR).path_url_segs(path).inline();
                            conn.file_body(content).await.unwrap_or_else(|p| p.connection)
                        }
                        ["menu.js"] => conn.js_body(include_str!("../data/static/menu.js")),
                        ["style.css"] => conn.css_body(include_str!("../data/static/style.css")),
                        ["code-tool.js"] => conn.js_body(include_str!("../data/static/code-tool.js")),
                        ["optimizer.js"] => conn.js_body(include_str!("../data/static/optimizer.js")),
                        ["load-screen.js"] => conn.js_body(include_str!("../data/static/load-screen.js")),
                        ["manifest.json"] => conn.json_body(include_str!("../data/static/manifest.json")),
                        ["favicon.ico"] => conn.add_header("Content-Type", "image/x-icon")
                            .binary_body(include_bytes!("../data/static/favicon.ico")),
                        ["icon.png"] => conn.png_body(include_bytes!("../data/static/icon.png")),
                        [path @ ..] => {
                            match docs_routing(path).await {
                                Ok(Some(html)) => conn.html_body(html),
                                Ok(None) => {
                                    let redirect_path = "/raw/".to_string() + &path.join("/");
                                    conn.redirect(redirect_path)
                                }
                                Err(_) => conn.set_status_code(HttpStatusCode::NotFound).no_body(),
                            }
                        }
                        _ => conn.set_status_code(HttpStatusCode::NotFound).no_body(),
                    }
                }
                _ => conn.set_status_code(HttpStatusCode::MethodNotAllowed).no_body()
            }
        })
        .run().await
}

pub struct RustyDocContext {
    pub index: Arc<TFIDFVectorizer>,
    pub catche: Arc<DashMap<String, String>>,
}

/// HTML テンプレートにコンテンツを埋め込む
pub fn html(path: &[&str], content: &str) -> String {
    format!(
        include_str!("../data/static/index.html"),
        title = format!("Index of /{}", path.join("/")),
        content = content
    )
}

/// Err => 404
/// Ok(None) => redirect raw endpoint
/// Ok(Some(bytes)) => serve bytes
pub async fn docs_routing(path: &[&str]) -> std::io::Result<Option<String>> {
    let builder = match FileContentBuilder::base(BASE_DIR).path_url_segs(path).check_file_exists().await {
        Ok(f) => f,
        Err(d) => match d {
            Some(dir) => return Ok(Some(md_dir_render(dir, path).await)),
            None => return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "File not found")),
        }
    };
    let mut file = builder.build().await?;
    if file.mime_type != "text/markdown; charset=utf-8" {
        return Ok(None);
    }
    let mut buf = String::new();
    let _bytes = file.file.read_to_string(&mut buf).await?;
    let content = md_to_html_gfm_highlight(&buf);
    Ok(Some(html(path, &content)))
}

/// ディレクトリ一覧を Markdown で生成して HTML 化
/// index.md があれば末尾に追加
pub async fn md_dir_render(dir: Vec<DirEntryInfo>, path: &[&str]) -> String {
    let mut path_with_index = if path == [""] {
        vec![]
    } else {
        path.to_vec()
    };
    path_with_index.push("index.md");
    let index_md: Option<String> = match FileContentBuilder::base(BASE_DIR).path_url_segs(&path_with_index).build().await {
        Ok(mut file) => {
            if file.mime_type != "text/markdown; charset=utf-8" {
                None
            } else {
                let mut buf = String::new();
                match file.file.read_to_string(&mut buf).await {
                    Err(_) => None,
                    Ok(_) => Some(buf),
                }
            }
        }
        Err(_) => None,
    };
    let mut files: Vec<&str> = Vec::new();
    let mut dirs: Vec<&str> = Vec::new();
    for entry in dir.iter() {
        if entry.kind.is_dir() {
            let opt_dir_name = entry.path.file_name().and_then(|n| n.to_str());
            if let Some(dir_name) = opt_dir_name {
                if ! dir_name.starts_with(".") {
                    dirs.push(dir_name);
                }
            }
        } else if entry.kind.is_file() {
            let opt_file_name = entry.path.file_name().and_then(|n| n.to_str());
            if let Some(file_name) = opt_file_name {
                if ! file_name.starts_with(".") {
                    files.push(file_name);
                }
            }
        }
    }
    files.sort_unstable();
    dirs.sort_unstable();
    let mut md = format!("# Index of [root](/)/{}",
        path.iter().enumerate().map(|(i, p)| {
            let link = if i == path.len() - 1 {
                // 最後はリンクなし
                p.to_string()
            } else {
                let href = format!("/{}", url_encode(&path[..=i].join("/")));
                format!("[{}]({})", p, href)
            };
            link
        }).collect::<Vec<_>>().join("/")
    );
    md.push_str(
        &match dirs.iter().map(|d| format!("- [{}]({}/{})", d, url_encode(path.last().map_or("", |v| v)), url_encode(d))).collect::<Vec<_>>().join("\n") {
            s if s.is_empty() => "".to_string(),
            s => format!("\n\n# Directories\n\n{}", s),
        }
    );
    md.push_str(
        &match files.iter().map(|f| format!("- [{}]({}/{})", f, url_encode(path.last().map_or("", |v| v)), url_encode(f))).collect::<Vec<_>>().join("\n") {
            s if s.is_empty() => "".to_string(),
            s => format!("\n\n# Files\n\n{}", s),
        }
    );
    md.push_str(
        &match index_md {
            Some(content) => format!("\n\n---\n\n\\> from index.md\n\n{}", content),
            None => "".to_string(),
        }
    );
    let content = md_to_html_gfm_highlight(&md);
    html(path, &content)
}
