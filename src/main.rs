use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web::http::header::{Header, Range};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::fs::File;

mod dashboard;

async fn list_articles_by_month(
    path: web::Path<(String, String)>,
    query: web::Query<HashMap<String, String>>,
) -> impl Responder {
    let (year, month) = path.into_inner();
    // 月のフォーマットを正規化（先頭の0を削除）
    let normalized_month = month.trim_start_matches('0');
    let base_path = format!("./data/{}/{}", year, normalized_month);
    let page: usize = query.get("page").and_then(|p| p.parse().ok()).unwrap_or(1);
    let per_page: usize = query.get("per_page").and_then(|p| p.parse().ok()).unwrap_or(10);

    let mut articles = Vec::new();
    if let Ok(files) = fs::read_dir(&base_path) {
        for file_entry in files.flatten() {
            if let Some(article_name) = file_entry.file_name().to_str() {
                articles.push(article_name.to_string());
            }
        }
    }

    let start = (page - 1) * per_page;
    let end = start + per_page;
    let paginated_articles = articles[start.min(articles.len())..end.min(articles.len())].to_vec();

    HttpResponse::Ok().json(json!({ "articles": paginated_articles }))
}

async fn get_article_raw(
    path: web::Path<(String, String, String)>,
    req: HttpRequest,
) -> impl Responder {
    let (year, month, article) = path.into_inner();
    // 月のフォーマットを正規化（先頭の0を削除）
    let normalized_month = month.trim_start_matches('0');
    let file_path = format!("./data/{}/{}/{}", year, normalized_month, article);

    if let Ok(mut file) = File::open(&file_path) {
        let metadata = file.metadata().ok();
        let file_size = metadata.map(|m| m.len()).unwrap_or(0);

        if let Some(range_header) = req.headers().get("Range") {
            if let Ok(range) = range_header.to_str() {
                if let Some(range) = range.strip_prefix("bytes=") {
                    let parts: Vec<&str> = range.split('-').collect();
                    if let (Some(start), Some(end)) = (parts.get(0), parts.get(1)) {
                        if let (Ok(start), Ok(end)) = (start.parse::<u64>(), end.parse::<u64>()) {
                            if start < file_size && end < file_size {
                                let mut buffer = vec![0; (end - start + 1) as usize];
                                file.seek(SeekFrom::Start(start)).ok();
                                file.read_exact(&mut buffer).ok();
                                return HttpResponse::PartialContent()
                                    .insert_header(("Content-Range", format!("bytes {}-{}/{}", start, end, file_size)))
                                    .body(buffer);
                            }
                        }
                    }
                }
            }
        }

        // Rangeヘッダーがない場合は全体を返す
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).ok();
        return HttpResponse::Ok().body(buffer);
    }

    HttpResponse::NotFound().body("記事が見つかりません")
}

async fn root_page() -> impl Responder {
    let file_path = "./data/index.html";
    if let Ok(content) = fs::read_to_string(file_path) {
        HttpResponse::Ok().content_type("text/html").body(content)
    } else {
        HttpResponse::NotFound().body("ルートページが見つかりません")
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(root_page))
            .route("/articles/{year}/{month}", web::get().to(list_articles_by_month))
            .route("/article/raw/{year}/{month}/{article}", web::get().to(get_article_raw))
    })
    .bind(("0.0.0.0", 88))?
    .run()
    .await
}
