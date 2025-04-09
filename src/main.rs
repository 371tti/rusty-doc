mod api;
mod state;

use actix_web::{web, App, HttpServer};

use api::API;


#[actix_web::main]
async fn main() -> std::io::Result<()> {

    
    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(API::index))
    })
    .bind(("0.0.0.0", 88))?
    .run()
    .await
}
