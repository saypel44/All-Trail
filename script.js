/* ── Bhutan Lifestyle Study · script.js ── */

let visitorName = '';


// ── Greeting helper ────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}


// ── Per-page personalised greeting cards ───────────────────────────────────

function setGreetingCards(name, greet) {
  const cards = [
    {
      id:   'findings-greeting-text',
      text: `Here's a breakdown of the seven key findings from the study — from respondent distribution to market readiness for wellness tools.`,
    },
    {
      id:   'market-greeting-text',
      text: `This section examines whether Bhutan has a viable market for digital wellness tools — and what the data says.`,
    },
    {
      id:   'files-greeting-text',
      text: `Here are the files related to the project. Click "Preview" to view the Tableau Public story and the report directly on this page, or click "Download" to access the files.`,
    },
  ];

  cards.forEach(({ id, text }) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector(".link-like").addEventListener("click", () => {
    showPage("page-products");
  });
});

// Hamburger
function showAboutFirst(button) {
    // Show about content
    showHomeSection('about', button);

    // Reveal other tabs
    document.getElementById("otherHomeTabs").style.display = "flex";
}


// ── Pages that are live (others show "Coming Soon") ───────────────────────

const LIVE_PAGES = ['home', 'about', 'findings', 'market', 'tableau', 'report', 'products'];


// ── Navigation ─────────────────────────────────────────────────────────────

function navigateTo(pageId, btn) {
  if (!LIVE_PAGES.includes(pageId)) {
    showComingSoon(pageId);
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.add('active');
    target.style.animation = 'none';
    target.offsetHeight; // reflow
    target.style.animation = '';
  }

  if (btn) btn.classList.add('active');

  document.querySelectorAll('.bottom-nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-page') === pageId);
  });

  closeMobileSidebar();

  if (pageId === 'market') setTimeout(animateMarketBars, 200);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}




// ── Show home section (tabs) ───────────────────────────────────────────────

function showHomeSection(sectionId, btn) {
  document.querySelectorAll('.home-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.home-tab').forEach(b => b.classList.remove('active'));

  const target = document.getElementById('home-' + sectionId);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
}


// ── Animate market bar fills ───────────────────────────────────────────────

function animateMarketBars() {
  document.querySelectorAll('.mkt-card-bar-fill[data-target]').forEach(bar => {
    const target = parseFloat(bar.getAttribute('data-target')) || 0;
    bar.style.transition = 'width 1s cubic-bezier(0.22,1,0.36,1)';
    bar.style.width = target + '%';
  });

  document.querySelectorAll('.fc-bar-fill[style*="width"]').forEach(bar => {
    const w = bar.style.width;
    bar.style.width = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.transition = 'width 1s cubic-bezier(0.22,1,0.36,1)';
        bar.style.width = w;
      });
    });
  });
}


// ── Scroll to a specific finding card ─────────────────────────────────────

function scrollToFinding(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: 'smooth' });
}

// ── Toggle PDF/preview viewer ──────────────────────────────────────────────

function togglePdfReader(viewerId, btn) {
  const viewer = document.getElementById(viewerId);
  if (!viewer) return;

  const isOpen = viewer.style.display !== 'none';
  viewer.style.display = isOpen ? 'none' : 'block';

  if (btn) btn.classList.toggle('prc-toggle-btn--active', !isOpen);
}



function toggleStoryPdf(btn) {
  const viewer = document.getElementById("story-pdf-viewer");

  if (viewer.style.display === "none" || viewer.style.display === "") {
    viewer.style.display = "block";
    btn.innerText = "✖ Close PDF";
    btn.classList.add("prc-toggle-btn--active");
    viewer.scrollIntoView({ behavior: "smooth" });
  } else {
    viewer.style.display = "none";
    btn.innerText = "⬇ Read as PDF";
    btn.classList.remove("prc-toggle-btn--active");
  }
}


// ── Mobile sidebar toggle ──────────────────────────────────────────────────

function toggleMobileSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar.classList.contains('open')) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('open');
    backdrop.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('visible');
  document.body.style.overflow = '';
}


// ── Auto-load on startup ───────────────────────────────────────────────────

function autoLoadApp() {
  visitorName = 'Guest';

  const greet = getGreeting();

  document.getElementById('sidebar-avatar').textContent = 'G';
  document.getElementById('sidebar-username').textContent = 'Guest';

  document.getElementById('greeting-text').innerHTML =
    `${greet} — welcome to SomPel Tech 2026.`;

  setGreetingCards(visitorName, greet);

  navigateTo('home', document.querySelector('.nav-item[data-page="home"]'));

  setTimeout(animateMarketBars, 600);
}


// ── Sync bottom-nav active state ──────────────────────────────────────────

function syncBottomNav(btn) {
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}


// ── Sign-out stub ─────────────────────────────────────────────────────────

function doSignOut() {
  if (confirm('Sign out? This will reload the page.')) location.reload();
}


// ── DOMContentLoaded ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  autoLoadApp();

  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeMobileSidebar();
    });
  });
});