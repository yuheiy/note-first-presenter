// The built-in export template, inlined as a module string so it is bundled
// into the packed CLI. A standalone .eta asset would not be tracked by the
// bundler and would be missing from dist/ at runtime.
export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title><%= it.title %></title>
</head>
<body>
<h1><%= it.title %></h1>
<% it.slides.forEach(function (slide) { %>
<% if (slide.image) { %><figure><img src="<%= slide.image %>" width="<%= slide.width %>" height="<%= slide.height %>"<% if (slide.number > 1) { %> loading="lazy"<% } %> alt="" /></figure><% } %>
<%~ it.toHtml(slide.notes) %>
<% }) %>
</body>
</html>
`;
