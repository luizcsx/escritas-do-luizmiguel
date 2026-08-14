  const SUPABASE_URL     = 'https://sbciwtnfymguxzaiyobh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiY2l3dG5meW1ndXh6YWl5b2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTc4NzcsImV4cCI6MjA5Njg3Mzg3N30.Mtdd8dLOKp_uCYmkVIEwuZBbq3Am9WV-66VFX3329mI';

  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  document.getElementById('footer-year').textContent = new Date().getFullYear();

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  }

  function renderContent(text) {
    if (!text) return '';
    const rawHtml = marked.parse(text, { breaks: true });
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'hr',
        'strong', 'em', 'b', 'i', 'u', 's', 'del',
        'a', 'img',
        'ul', 'ol', 'li',
        'blockquote', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel']
    });
  }

  async function init() {
    const params   = new URLSearchParams(window.location.search);
    const postSlug = params.get('post');
    const catSlug  = params.get('categoria');

    const [{ data: categories }, { data: allPostsMini }, { data: searchData }] = await Promise.all([
      sb.from('categories').select('id, name, slug').order('name'),
      sb.from('posts').select('category_id'),
      sb.from('posts').select('title, slug, content')
    ]);

    const countMap = {};
    (allPostsMini || []).forEach(p => {
      if (p.category_id) countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
    });

    buildNav(categories || [], catSlug, postSlug);
    buildSidebar(categories || [], countMap);
    setupSearch(searchData || []);

    if (postSlug) {
      await viewPost(postSlug);
    } else if (catSlug) {
      await viewCategory(catSlug, categories || []);
    } else {
      await viewHome();
    }
  }

  function normalizeText(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function setupSearch(posts) {
    const input   = document.getElementById('search-input');
    const results = document.getElementById('search-results');

    const index = posts.map(p => ({
      title: p.title,
      slug: p.slug,
      normTitle: normalizeText(p.title || ''),
      normContent: normalizeText(p.content || ''),
      snippet: (p.content || '').slice(0, 90).replace(/[#*_>`]/g, '').trim()
    }));

    let debounceTimer = null;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runSearch(input.value), 150);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim()) results.classList.add('open');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) results.classList.remove('open');
    });

    function runSearch(rawQuery) {
      const query = normalizeText(rawQuery.trim());

      if (!query) {
        results.classList.remove('open');
        results.innerHTML = '';
        return;
      }

      const scored = index
        .map(item => {
          let score = 0;
          if (item.normTitle === query) score += 100;
          else if (item.normTitle.startsWith(query)) score += 50;
          else if (item.normTitle.includes(query)) score += 25;
          if (item.normContent.includes(query)) score += 5;
          return { item, score };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      if (!scored.length) {
        results.innerHTML = '<div class="search-empty">Nenhum resultado encontrado.</div>';
        results.classList.add('open');
        return;
      }

      results.innerHTML = scored.map(({ item }) => `
        <a class="search-result-item" href="?post=${item.slug}">
          <span class="search-result-title">${item.title}</span>
          <span class="search-result-snippet">${item.snippet}…</span>
        </a>
      `).join('');
      results.classList.add('open');
    }
  }

  function buildNav(categories, activeCat, activePost) {
    const nav = document.getElementById('card-nav');
    const allLink = document.getElementById('nav-all');

    if (!activeCat && !activePost) allLink.classList.add('active');

    categories.forEach(cat => {
      const a = document.createElement('a');
      a.href = `?categoria=${cat.slug}`;
      a.textContent = cat.name;
      if (activeCat === cat.slug) a.classList.add('active');
      nav.appendChild(a);
    });
  }

  function buildSidebar(categories, countMap) {
    const list = document.getElementById('cat-list');
    if (!categories.length) {
      list.innerHTML = '<li><span class="state-msg">Sem categorias.</span></li>';
      return;
    }
    list.innerHTML = categories.map(cat => `
      <li>
        <a href="?categoria=${cat.slug}">${cat.name}</a>
        <span class="cat-count">${countMap[cat.id] || 0}</span>
      </li>
    `).join('');
  }

  async function viewHome() {
    const main = document.getElementById('card-main');

    const { data: posts, error } = await sb
      .from('posts')
      .select('id, title, slug, content, excerpt, image_url, published_at, categories(name, slug)')
      .order('published_at', { ascending: false })
      .limit(10);

    if (error) { main.innerHTML = `<p class="state-msg">Erro: ${error.message}</p>`; return; }
    if (!posts || !posts.length) { main.innerHTML = '<p class="state-msg">Nenhuma escrita publicada ainda.</p>'; return; }

    const [latest, ...older] = posts;
    const cat = latest.categories;

    let html = `
      <div>
        ${latest.image_url ? `<img class="post-image" src="${latest.image_url}" alt="${latest.title}">` : ''}
        <div class="post-meta">
          <span>${formatDate(latest.published_at)}</span>
          ${cat ? `<a class="post-cat-tag" href="?categoria=${cat.slug}">${cat.name}</a>` : ''}
        </div>
        <h1 class="post-title">
          <a href="?post=${latest.slug}">${latest.title}</a>
        </h1>
        <div class="post-content">${renderContent(latest.content)}</div>
      </div>
    `;

    if (older.length) {
      html += `
        <div class="older-posts">
          <div class="section-label">Escritas anteriores</div>
          ${older.map(p => `
            <div class="post-list-item">
              <div class="post-list-left">
                ${p.image_url ? `<img class="post-list-thumb" src="${p.image_url}" alt="">` : ''}
                <a class="post-list-title" href="?post=${p.slug}">${p.title}</a>
              </div>
              <span class="post-list-date">${formatDate(p.published_at)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    main.innerHTML = html;
  }

  async function viewPost(slug) {
    const main = document.getElementById('card-main');

    const { data: posts, error } = await sb
      .from('posts')
      .select('id, title, slug, content, image_url, published_at, categories(name, slug)')
      .eq('slug', slug)
      .limit(1);

    if (error || !posts || !posts.length) {
      main.innerHTML = `<a class="back-link" href="/">&larr; Voltar</a><p class="state-msg">Escrita não encontrada.</p>`;
      return;
    }

    const post = posts[0];
    const cat  = post.categories;

    document.title = `${post.title} - Escritas do Luiz Miguel`;

    main.innerHTML = `
      <a class="back-link" href="/">&larr; Todos os posts</a>
      ${post.image_url ? `<img class="post-image" src="${post.image_url}" alt="${post.title}">` : ''}
      <div class="post-meta">
        <span>${formatDate(post.published_at)}</span>
        ${cat ? `<a class="post-cat-tag" href="?categoria=${cat.slug}">${cat.name}</a>` : ''}
      </div>
      <h1 class="post-title" style="font-size:1.85rem">${post.title}</h1>
      <div class="post-content">${renderContent(post.content)}</div>
    `;
  }

  async function viewCategory(catSlug, categories) {
    const main  = document.getElementById('card-main');
    const found = categories.find(c => c.slug === catSlug);

    const { data: posts, error } = await sb
      .from('posts')
      .select('id, title, slug, image_url, published_at, categories!inner(slug)')
      .eq('categories.slug', catSlug)
      .order('published_at', { ascending: false });

    if (error) { main.innerHTML = `<p class="state-msg">Erro: ${error.message}</p>`; return; }

    const catName = found ? found.name : catSlug;
    document.title = `${catName} - Escritas do Luiz Miguel`;

    let html = `
      <a class="back-link" href="/">&larr; Todos os posts</a>
      <div class="category-posts-title">${catName}</div>
    `;

    if (!posts || !posts.length) {
      html += '<p class="state-msg">Nenhuma escrita nessa categoria ainda.</p>';
    } else {
      html += posts.map(p => `
        <div class="post-list-item">
          <div class="post-list-left">
            ${p.image_url ? `<img class="post-list-thumb" src="${p.image_url}" alt="">` : ''}
            <a class="post-list-title" href="?post=${p.slug}">${p.title}</a>
          </div>
          <span class="post-list-date">${formatDate(p.published_at)}</span>
        </div>
      `).join('');
    }

    main.innerHTML = html;
  }

  init().catch(err => {
    document.getElementById('card-main').innerHTML =
      `<p class="state-msg">Erro ao inicializar: ${err.message}</p>`;
  });
