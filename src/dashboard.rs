use actix_web::{HttpResponse, Responder};

pub async fn dashboard() -> impl Responder {
    let dashboard_html = r#"
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Rusty Blog Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          header { text-align: center; }
          .container { display: flex; }
          .sidebar { width: 200px; padding: 10px; background: #f0f0f0; }
          .content { flex: 1; padding: 10px; }
          a { cursor: pointer; text-decoration: none; color: blue; }
          .article-item { margin: 5px 0; }
        </style>
      </head>
      <body>
        <header>
          <h1>Rusty Blog Dashboard</h1>
        </header>
        <div class="container">
          <div class="sidebar" id="sidebar"></div>
          <div class="content" id="content">
            <p>Welcome! Loading articles...</p>
            <button onclick="showNewArticleForm()">New Article</button>
          </div>
        </div>
        <script>
          async function init() {
            try {
              const res = await fetch('/articles');
              const data = await res.json();
              const sidebar = document.getElementById('sidebar');
              sidebar.innerHTML = '<h3>Articles</h3>';
              if (data.articles) {
                data.articles.forEach(path => {
                  const link = document.createElement('div');
                  link.className = 'article-item';
                  link.innerHTML = '<a onclick="loadArticle(\\'' + path + '\\')">' + path + '</a>';
                  sidebar.appendChild(link);
                });
                sidebar.innerHTML += '<div style="margin-top:20px;"><a onclick="loadRanking()">Ranking</a></div>';
              }
            } catch(e) {
              console.error(e);
            }
          }

          async function loadArticle(path) {
            const parts = path.split('/');
            if (parts.length !== 3) return;
            const url = '/article/' + parts[0] + '/' + parts[1] + '/' + parts[2];
            const res = await fetch(url);
            const data = await res.json();
            const content = document.getElementById('content');
            content.innerHTML = '<h2>' + data.article + '</h2>' + data.content +
              '<br><button onclick="setFavorite(\\''+parts[2]+'\\')">お気に入り</button>';
          }

          async function setFavorite(article) {
            const url = '/favorite/' + article;
            const res = await fetch(url);
            const msg = await res.json();
            alert(msg.message);
          }

          async function loadRanking() {
            const res = await fetch('/ranking');
            const data = await res.json();
            document.getElementById('content').innerHTML = '<h2>Ranking</h2><pre>' + JSON.stringify(data, null, 2) + '</pre>';
          }

          function showNewArticleForm() {
            const content = document.getElementById('content');
            content.innerHTML = `
              <h2>Create New Article</h2>
              <form onsubmit="createArticle(event)">
                <div><input id="year" placeholder="Year" required /></div>
                <div><input id="day" placeholder="Day" required /></div>
                <div><input id="filename" placeholder="Filename (e.g. text.md)" required /></div>
                <div>
                  <textarea id="articleContent" placeholder="Markdown content here" rows="8" cols="40"></textarea>
                </div>
                <button type="submit">Submit</button>
              </form>
            `;
          }

          async function createArticle(event) {
            event.preventDefault();
            const data = {
              year: document.getElementById('year').value,
              day: document.getElementById('day').value,
              file: document.getElementById('filename').value,
              content: document.getElementById('articleContent').value
            };
            const res = await fetch('/new-article', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const msg = await res.json();
            alert(msg.message || 'Created');
          }

          window.addEventListener('load', init);
        </script>
      </body>
    </html>
    "#;
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(dashboard_html)
}
