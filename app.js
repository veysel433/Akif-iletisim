/* ================================================================
   🔥 AKİF İLETİŞİM — app.js v3
   ✅ Google Sign-In (müşteriler)
   ✅ Firestore'dan dinamik kategori çekme
   ✅ Ürüne tıklayınca detay sayfası
   ================================================================ */

const firebaseConfig = {
  apiKey:            "AIzaSyA_qQBvQgAMON13EDSPTUNu58t0W4RD0FA",
  authDomain:        "akif-iletisim-gercekci.firebaseapp.com",
  projectId:         "akif-iletisim-gercekci",
  storageBucket:     "akif-iletisim-gercekci.firebasestorage.app",
  messagingSenderId: "527995566381",
  appId:             "1:527995566381:web:9ef6f0e8c37acbec89fba4",
  measurementId:     "G-D9WD7K857R",
};
const WA_NUMBER = "905419705263";

firebase.initializeApp(firebaseConfig);
const db       = firebase.firestore();
const auth     = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/* ── STATE ── */
var allProducts      = [];
var filteredProducts = [];
var activeCategory   = 'all';
var searchQuery      = '';
var currentUser      = null;
var cart = JSON.parse(localStorage.getItem('akif_cart') || '[]');

/* ── BAŞLANGIÇ ── */
document.addEventListener('DOMContentLoaded', function () {
  window.addEventListener('scroll', function () {
    document.getElementById('header').classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
  loadProducts();
  renderCart();
  updateCartBadge();
});

/* ── GOOGLE AUTH ── */
auth.onAuthStateChanged(function(user) {
  currentUser = user;
  renderUserArea(user);
});

function renderUserArea(user) {
  var btn      = document.getElementById('user-btn');
  var dropdown = document.getElementById('user-dropdown');

  if (user) {
    var photo = user.photoURL
      ? '<img src="' + escHtml(user.photoURL) + '" referrerpolicy="no-referrer" />'
      : '<i class="fa-solid fa-user" style="font-size:13px;color:#c9a84c;"></i>';
    var name = user.displayName ? user.displayName.split(' ')[0] : 'Hesabım';

    btn.innerHTML = photo + '<span class="user-name">' + escHtml(name) + '</span><i class="fa-solid fa-chevron-down" style="font-size:9px;"></i>';

    dropdown.innerHTML =
      '<div style="padding:14px 16px;border-bottom:1px solid #2e333a;">' +
        '<div style="font-size:13px;font-weight:600;margin-bottom:2px;">' + escHtml(user.displayName || 'Kullanıcı') + '</div>' +
        '<div style="font-size:11px;color:#5a6070;">' + escHtml(user.email) + '</div>' +
      '</div>' +
      '<button class="user-dropdown-item danger" onclick="signOutGoogle()">' +
        '<i class="fa-solid fa-right-from-bracket"></i> Çıkış Yap' +
      '</button>';
  } else {
    btn.innerHTML =
      '<i class="fa-brands fa-google" style="color:#c9a84c;font-size:13px;"></i>' +
      '<span class="user-name">Giriş Yap</span>' +
      '<i class="fa-solid fa-chevron-down" style="font-size:9px;"></i>';

    dropdown.innerHTML =
      '<div style="padding:14px 16px;font-size:12px;color:#9aa0aa;border-bottom:1px solid #2e333a;">Alışveriş geçmişini kaydetmek için giriş yap.</div>' +
      '<button class="user-dropdown-item" onclick="signInGoogle()">' +
        '<i class="fa-brands fa-google" style="color:#c9a84c;"></i> Google ile Giriş Yap' +
      '</button>';
  }
}

async function signInGoogle() {
  closeUserDropdown();
  try {
    await auth.signInWithPopup(provider);
    showToast('Giriş yapıldı. Hoş geldin!', 'success');
  } catch(err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Giriş başarısız: ' + err.message, 'error');
    }
  }
}

async function signOutGoogle() {
  closeUserDropdown();
  await auth.signOut();
  showToast('Çıkış yapıldı.', 'info');
}

function toggleUserDropdown() {
  document.getElementById('user-dropdown').classList.toggle('open');
}
function closeUserDropdown() {
  document.getElementById('user-dropdown').classList.remove('open');
}
document.addEventListener('click', function(e) {
  var area = document.getElementById('user-area');
  if (area && !area.contains(e.target)) closeUserDropdown();
});

/* ── ÜRÜNLER ── */
async function loadProducts() {
  try {
    var snap = await db.collection('products').orderBy('createdAt', 'desc').get();
    allProducts = snap.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
    buildCategoryBar();
    hideSkeleton();
    applyFilters();
  } catch(err) {
    console.error(err);
    hideSkeleton();
    document.getElementById('product-grid').innerHTML =
      '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Ürünler yüklenemedi. Sayfayı yenileyin.</p></div>';
  }
}

function hideSkeleton() {
  document.getElementById('skeleton-grid').style.display = 'none';
  document.getElementById('product-grid').style.display  = 'grid';
}

/* ── DİNAMİK KATEGORİ ÇUBUĞU ──
   Kategorileri Firestore'daki ürünlerden otomatik toplar
   + admin'in Firestore'a kaydettiği özel kategorileri de çeker */
var CAT_ICONS = {
  'Telefon':'fa-mobile-screen','Tablet':'fa-tablet-screen-button','Laptop':'fa-laptop',
  'Aksesuar':'fa-plug','Kulaklık':'fa-headphones','Saat':'fa-clock',
  'Tv & Ses Sistemi':'fa-tv','Oyun':'fa-gamepad','Diğer':'fa-box',
};

async function buildCategoryBar() {
  /* 1 — ürünlerden kategorileri topla */
  var fromProducts = [];
  allProducts.forEach(function(p) {
    if (p.category && !fromProducts.includes(p.category)) fromProducts.push(p.category);
  });

  /* 2 — Firestore'daki özel kategorileri çek */
  var extraCats = [];
  try {
    var snap = await db.collection('categories').get();
    snap.docs.forEach(function(doc) {
      var name = doc.data().name;
      if (name && !fromProducts.includes(name)) extraCats.push(name);
    });
  } catch(e) { /* kategori koleksiyonu yoksa geç */ }

  var allCats = fromProducts.concat(extraCats);

  var bar = document.getElementById('category-bar');
  /* "Tümü" butonunu koru */
  bar.innerHTML = '<button class="cat-chip active" data-cat="all" onclick="filterByCategory(\'all\',this)"><i class="fa-solid fa-border-all"></i> Tümü</button>';

  allCats.forEach(function(cat) {
    var icon = CAT_ICONS[cat] || 'fa-tag';
    var btn = document.createElement('button');
    btn.className = 'cat-chip';
    btn.dataset.cat = cat;
    btn.setAttribute('onclick', "filterByCategory('" + escJs(cat) + "',this)");
    btn.innerHTML = '<i class="fa-solid ' + icon + '"></i> ' + escHtml(cat);
    bar.appendChild(btn);
  });
}

/* ── FİLTRE & ARAMA ── */
function filterByCategory(cat, el) {
  activeCategory = cat;
  searchQuery    = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.getElementById('section-title').textContent = cat === 'all' ? 'Tüm Ürünler' : cat;
  applyFilters();
}

function handleSearch(val) {
  searchQuery = val.trim().toLowerCase();
  document.getElementById('search-clear').style.display = val ? 'block' : 'none';
  if (searchQuery) {
    activeCategory = 'all';
    document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('active'); });
    var allBtn = document.querySelector('[data-cat="all"]');
    if (allBtn) allBtn.classList.add('active');
    document.getElementById('section-title').textContent = '"' + val + '" sonuçları';
  } else {
    document.getElementById('section-title').textContent = 'Tüm Ürünler';
  }
  applyFilters();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  handleSearch('');
}

function applyFilters() {
  filteredProducts = allProducts.filter(function(p) {
    var catOk    = activeCategory === 'all' || p.category === activeCategory;
    var searchOk = !searchQuery ||
      (p.name||'').toLowerCase().includes(searchQuery) ||
      (p.category||'').toLowerCase().includes(searchQuery) ||
      (p.description||'').toLowerCase().includes(searchQuery);
    return catOk && searchOk;
  });
  document.getElementById('product-count').textContent = filteredProducts.length + ' ürün';
  renderProducts(filteredProducts);
}

/* ── ÜRÜN RENDER ── */
function renderProducts(products) {
  var grid = document.getElementById('product-grid');
  if (!products.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-box-open"></i><p>Ürün bulunamadı.</p></div>';
    return;
  }
  grid.innerHTML = products.map(function(p, i) {
    var isSale  = p.salePrice && p.salePrice < p.price;
    var isStock = p.stock !== 'outofstock';
    var price   = isSale ? p.salePrice : p.price;
    var pct     = isSale ? (p.discountPct || Math.round((1 - p.salePrice/p.price)*100)) : 0;
    var delay   = Math.min(i * 40, 400);

    var priceHtml = isSale
      ? '<span class="price-new">' + formatPrice(p.salePrice) + '</span><span class="price-old">' + formatPrice(p.price) + '</span>'
      : '<span class="price-new normal">' + formatPrice(p.price) + '</span>';

    var badgeHtml = isSale
      ? '<div class="badge-firsat"><i class="fa-solid fa-bolt"></i> Fırsat</div><div class="badge-pct">%' + pct + '</div>' : '';

    var stockHtml = !isStock
      ? '<div class="out-of-stock-overlay"><span>Stok Tükendi</span></div>' : '';

    var fallback = "this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 4 3%22><rect width=%224%22 height=%223%22 fill=%22%2221252b%22/></svg>'";

    var cartBtn = isStock
      ? '<button class="btn-cart" onclick="addToCart(\'' + escJs(p.id) + '\',event)"><i class="fa-solid fa-bag-shopping"></i> Sepete Ekle</button>'
      : '<button class="btn-cart" disabled style="opacity:.4;cursor:not-allowed;"><i class="fa-solid fa-ban"></i> Stok Tükendi</button>';

    return (
      '<div class="p-card" style="animation-delay:' + delay + 'ms" onclick="goToProduct(event,\'' + escJs(p.id) + '\')">' +
        '<div class="p-card__img"><img src="' + escHtml(p.imageUrl||'') + '" alt="' + escHtml(p.name) + '" loading="lazy" onerror="' + fallback + '" />' + badgeHtml + stockHtml + '</div>' +
        '<div class="p-card__body"><div class="p-card__cat">' + escHtml(p.category||'') + '</div><div class="p-card__name">' + escHtml(p.name) + '</div><div class="p-card__price">' + priceHtml + '</div></div>' +
        '<div class="p-card__footer">' + cartBtn + '</div>' +
      '</div>'
    );
  }).join('');
}

function goToProduct(e, id) {
  if (e.target.closest('.btn-cart')) return;
  window.location.href = 'product-detail.html?id=' + id;
}

/* ── SEPET ── */
function addToCart(id, e) {
  if (e) e.stopPropagation();
  var product = allProducts.find(function(p) { return p.id === id; });
  if (!product) return;
  var price = (product.salePrice && product.salePrice < product.price) ? product.salePrice : product.price;
  var existing = cart.find(function(c) { return c.id === id; });
  if (existing) { existing.qty += 1; }
  else { cart.push({ id:id, name:product.name, price:price, imageUrl:product.imageUrl||'', qty:1 }); }
  saveCart(); updateCartBadge(); renderCart();
  showToast(product.name + ' sepete eklendi', 'success');
  var btn = e && e.target.closest('.btn-cart');
  if (btn) {
    btn.classList.add('added');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Eklendi';
    setTimeout(function() {
      btn.classList.remove('added');
      btn.innerHTML = '<i class="fa-solid fa-bag-shopping"></i> Sepete Ekle';
    }, 1600);
  }
}

function removeFromCart(id) {
  cart = cart.filter(function(c) { return c.id !== id; });
  saveCart(); updateCartBadge(); renderCart();
}

function changeQty(id, delta) {
  var item = cart.find(function(c) { return c.id === id; });
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  saveCart(); updateCartBadge(); renderCart();
}

function saveCart() { localStorage.setItem('akif_cart', JSON.stringify(cart)); }

function updateCartBadge() {
  var total = cart.reduce(function(s,c) { return s + c.qty; }, 0);
  var badge = document.getElementById('cart-badge');
  badge.textContent = total;
  badge.style.display = total > 0 ? 'flex' : 'none';
}

function renderCart() {
  var body   = document.getElementById('cart-body');
  var footer = document.getElementById('cart-footer');
  if (!cart.length) {
    body.innerHTML = '<div class="cart-empty"><i class="fa-solid fa-bag-shopping"></i><p>Sepetiniz boş.</p></div>';
    footer.style.display = 'none'; return;
  }
  body.innerHTML = cart.map(function(item) {
    return (
      '<div class="cart-item">' +
        '<img class="cart-item__img" src="' + escHtml(item.imageUrl) + '" alt="" onerror="this.style.display=\'none\'" />' +
        '<div class="cart-item__info">' +
          '<div class="cart-item__name">' + escHtml(item.name) + '</div>' +
          '<div class="cart-item__price">' + formatPrice(item.price) + '</div>' +
          '<div class="cart-item__qty">' +
            '<div class="qty-btn" onclick="changeQty(\'' + escJs(item.id) + '\',-1)"><i class="fa-solid fa-minus"></i></div>' +
            '<span class="qty-num">' + item.qty + '</span>' +
            '<div class="qty-btn" onclick="changeQty(\'' + escJs(item.id) + '\',1)"><i class="fa-solid fa-plus"></i></div>' +
          '</div>' +
        '</div>' +
        '<i class="fa-solid fa-xmark cart-item__remove" onclick="removeFromCart(\'' + escJs(item.id) + '\')"></i>' +
      '</div>'
    );
  }).join('');
  document.getElementById('cart-total-price').textContent = formatPrice(cart.reduce(function(s,c) { return s + c.price * c.qty; }, 0));
  footer.style.display = 'block';
}

function openCart()  { document.getElementById('cart-overlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { document.getElementById('cart-overlay').classList.remove('open'); document.body.style.overflow = ''; }
function handleCartOverlayClick(e) { if (e.target === document.getElementById('cart-overlay')) closeCart(); }

function checkout() {
  if (!cart.length) return;
  var lines = cart.map(function(item) { return '▸ ' + item.name + ' x' + item.qty + ' — ' + formatPrice(item.price * item.qty); });
  var total = cart.reduce(function(s,c) { return s + c.price * c.qty; }, 0);
  lines.push(''); lines.push('💰 *Toplam: ' + formatPrice(total) + '*');
  lines.push(''); lines.push('Merhaba, yukarıdaki ürünleri sipariş etmek istiyorum.');
  window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent('🛍️ *Akif İletişim Sipariş*\n\n' + lines.join('\n')), '_blank');
}

/* ── ADMİN GİRİŞ MODALİ ── */
function openLoginModal()  { document.getElementById('login-modal-overlay').classList.add('open'); }
function closeLoginModal() { document.getElementById('login-modal-overlay').classList.remove('open'); }
function handleModalOverlayClick(e) { if (e.target === document.getElementById('login-modal-overlay')) closeLoginModal(); }

async function doLogin() {
  var email    = document.getElementById('lm-email').value.trim();
  var password = document.getElementById('lm-password').value;
  var btn      = document.getElementById('btn-login');
  var errEl    = document.getElementById('login-error');
  if (!email || !password) { errEl.textContent = 'E-posta ve şifre zorunludur.'; errEl.style.display = 'block'; return; }
  btn.classList.add('loading'); errEl.style.display = 'none';
  try {
    await auth.signInWithEmailAndPassword(email, password);
    window.location.href = 'admin.html';
  } catch(err) {
    btn.classList.remove('loading');
    var map = { 'auth/wrong-password':'Şifre hatalı.','auth/user-not-found':'Bu e-posta kayıtlı değil.','auth/invalid-credential':'E-posta veya şifre hatalı.','auth/too-many-requests':'Çok fazla deneme.' };
    errEl.textContent = map[err.code] || 'Giriş başarısız.';
    errEl.style.display = 'block';
  }
}

/* ── TOAST ── */
function showToast(msg, type) {
  type = type || 'info';
  var icons = { success:'fa-circle-check', info:'fa-circle-info', error:'fa-circle-xmark' };
  var el = document.createElement('div');
  el.className = 'toast t-' + type;
  el.innerHTML = '<i class="fa-solid ' + (icons[type]||icons.info) + '"></i><span>' + escHtml(msg) + '</span>';
  document.getElementById('toast-root').appendChild(el);
  setTimeout(function() {
    el.style.transition = 'opacity .3s'; el.style.opacity = '0';
    setTimeout(function() { el.remove(); }, 320);
  }, 2800);
}

/* ── UTILS ── */
function formatPrice(num) {
  return Number(num||0).toLocaleString('tr-TR', { style:'currency', currency:'TRY', minimumFractionDigits:2 });
}
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escJs(s) {
  return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"');
}
