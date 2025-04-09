use actix_web::{HttpResponse, Responder};

/// APIを定義する
pub struct API;

impl API {
    pub fn new() -> Self {
        API
    }

    /// メインページを取得します html
    /// GET /
    pub async fn get_main_page() -> impl Responder {
      "あとで実装する"
    }

    /// ユーザーのページを取得します html
    /// GET /api/{username}/
    /// username: ユーザー名
    pub async fn get_user_page() -> impl Responder {
        HttpResponse::Ok().body("USER PAGE")
    }

    /// ユーザー情報を取得します json
    /// GET /api/{username}/user
    /// username: ユーザー名
    pub async fn get_user() -> impl Responder {
        HttpResponse::Ok().body("USER")
    }

    /// ユーザーのアイコンを取得します icon
    /// GET /api/{username}/icon
    /// username: ユーザー名
    pub async fn get_icon() -> impl Responder {
        HttpResponse::Ok().body("ICON")
    }

    /// ある記事のページを取得します html
    /// GET /api/{username}/article/{article_name}/
    /// username: ユーザー名
    /// article_name: 記事名
    pub async fn get_article_page() -> impl Responder {
        HttpResponse::Ok().body("ARTICLE PAGE")
    }

    /// ある記事の情報を取得します json
    /// GET /api/{username}/article/{article_name}/info
    /// username: ユーザー名
    /// article_name: 記事名
    pub async fn get_article_info() -> impl Responder {
        HttpResponse::Ok().body("INFO")
    }

    /// ある記事を取得します markdown
    /// GET /api/{username}/article/{article_name}/body?page={page}&num={page_num}
    /// username: ユーザー名
    /// article_name: 記事名
    /// page: markdownでのh1区切りでのページ番号
    /// num: 取得ページ数
    pub async fn get_article() -> impl Responder {
        HttpResponse::Ok().body("GET")
    }

    /// ある記事のindexを取得します json
    /// POST /api/{username}/article/{article_name}/index
    /// username: ユーザー名
    /// article_name: 記事名
    pub async fn get_index() -> impl Responder {
        HttpResponse::Ok().body("INDEX")
    }
  }





