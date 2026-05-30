export const DEFAULT_HTML_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title><%= it.title %></title>
</head>
<body>
<h1><%= it.title %></h1>
<% it.slides.forEach(function (slide) { %>
<section>
<h2>Slide <%= slide.number %></h2>
<% if (slide.image) { %><img src="<%= slide.image %>" alt="Slide <%= slide.number %>" /><% } %>
<%~ it.toHtml(slide.notes) %>
</section>
<% }) %>
</body>
</html>
`;
