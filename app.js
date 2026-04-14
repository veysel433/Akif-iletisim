/* ================================================================
   🔥 AKİF İLETİŞİM — app.js v4
   ✅ Hamburger kategori sidebar
   ✅ Fiyat/Yeni/Puan sıralama filtreleri
   ✅ Adım adım checkout (WhatsApp yok)
   ✅ Google Sign-In
   ✅ Çoklu ürün fotoğrafı desteği
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
var currentSort      = 'default';
var currentUser      = null;
var cart             = JSON.parse(localStorage.getItem('akif_cart') || '[]');
var checkoutStep     = 1;
var WHATSAPP_ORDER_NUMBER = '905419705263';

/* ── CAT ICONS ── */
var CAT_ICONS = {
  'Telefon':'fa-mobile-screen','Tablet':'fa-tablet-screen-button','Laptop':'fa-laptop',
  'Aksesuar':'fa-plug','Kulaklık':'fa-headphones','Saat':'fa-clock',
  'Tv & Ses Sistemi':'fa-tv','Oyun':'fa-gamepad','Diğer':'fa-box',
};

/* ── BAŞLANGIC ── */
document.addEventListener('DOMContentLoaded', function () {
  window.addEventListener('scroll', function () {
    document.getElementById('header').classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
  loadProducts();
  renderCart();
  updateCartBadge();
});

/* ── AUTH ── */
auth.onAuthStateChanged(function(user) {
  currentUser = user;
  renderUserArea(user);
});

function renderUserArea(user) {
  var btn = document.getElementById('user-btn');
  var dd  = document.getElementById('user-dd');
  if (user) {
    var photo = user.photoURL
      ? '<img src="'+escHtml(user.photoURL)+'" referrerpolicy="no-referrer" />'
      : '<i class="fa-solid fa-user" style="font-size:11px;color:var(--gold);"></i>';
    var name = user.displayName ? user.displayName.split(' ')[0] : 'Hesabım';
    btn.innerHTML = photo + '<span class="uname">' + escHtml(name) + '</span><i class="fa-solid fa-chevron-down" style="font-size:8px;"></i>';
    dd.innerHTML =
      '<div style="padding:12px 14px;border-bottom:1px solid var(--border);font-size:12px;">' +
        '<div style="font-weight:600;margin-bottom:2px;">' + escHtml(user.displayName || 'Kullanıcı') + '</div>' +
        '<div style="font-size:11px;color:var(--text-3);">' + escHtml(user.email) + '</div>' +
      '</div>' +
      '<a class="user-dd-item" href="profile.html"><i class="fa-solid fa-clock-rotate-left"></i> Siparişlerim</a>' +
      '<button class="user-dd-item danger" onclick="signOutUser()"><i class="fa-solid fa-right-from-bracket"></i> Çıkış Yap</button>';
  } else {
    btn.innerHTML = '<i class="fa-brands fa-google" style="color:var(--gold);font-size:12px;"></i><span class="uname">Giriş Yap</span><i class="fa-solid fa-chevron-down" style="font-size:8px;"></i>';
    dd.innerHTML =
      '<div style="padding:12px 14px;font-size:11px;color:var(--text-2);border-bottom:1px solid var(--border);">Alışveriş geçmişi için giriş yap.</div>' +
      '<button class="user-dd-item" onclick="signInGoogle()"><i class="fa-brands fa-google" style="color:var(--gold);"></i> Google ile Giriş Yap</button>';
  }
}

async function signInGoogle() {
  closeUserDD();
  try { await auth.signInWithPopup(provider); showToast('Hoş geldin!', 'success'); }
  catch(e) { if (e.code !== 'auth/popup-closed-by-user') showToast('Giriş başarısız.', 'error'); }
}
async function signOutUser() {
  closeUserDD();
  await auth.signOut();
  showToast('Çıkış yapıldı.', 'info');
}
function toggleUserDD() { document.getElementById('user-dd').classList.toggle('open'); }
function closeUserDD()  { document.getElementById('user-dd').classList.remove('open'); }
document.addEventListener('click', function(e) {
  var ua = document.getElementById('user-area');
  if (ua && !ua.contains(e.target)) closeUserDD();
});

/* ── ÜRÜNLER ── */
async function loadProducts() {
  try {
    var snap = await db.collection('products').orderBy('createdAt', 'desc').get();
    allProducts = snap.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
    // Her ürüne ortalama puanını çek
    await loadRatings();
    buildCategoryBar();
    hideSkeleton();
    applyFiltersAndSort();
  } catch(err) {
    console.error(err);
    hideSkeleton();
    document.getElementById('product-grid').innerHTML =
      '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Ürünler yüklenemedi.</p></div>';
  }
}

async function loadRatings() {
  // Her ürün için approved yorum ortalaması
  try {
    var snap = await db.collection('comments').where('status', '==', 'approved').get();
    var ratingMap = {};
    var countMap  = {};
    snap.docs.forEach(function(doc) {
      var d = doc.data();
      if (d.productId) {
        ratingMap[d.productId] = (ratingMap[d.productId] || 0) + (d.rating || 5);
        countMap[d.productId]  = (countMap[d.productId]  || 0) + 1;
      }
    });
    allProducts.forEach(function(p) {
      if (countMap[p.id]) {
        p._avgRating   = ratingMap[p.id] / countMap[p.id];
        p._ratingCount = countMap[p.id];
      } else {
        p._avgRating   = 0;
        p._ratingCount = 0;
      }
    });
  } catch(e) { /* Yorum koleksiyonu boşsa geç */ }
}

function hideSkeleton() {
  document.getElementById('skeleton-grid').style.display = 'none';
  document.getElementById('product-grid').style.display  = 'grid';
}

/* ── KATEGORİ SIDEBAR ── */
async function buildCategoryBar() {
  var cats = {};
  allProducts.forEach(function(p) { if (p.category) cats[p.category] = (cats[p.category] || 0) + 1; });

  // Firestore'dan ek kategoriler
  try {
    var snap = await db.collection('categories').get();
    snap.docs.forEach(function(doc) {
      var name = doc.data().name;
      if (name && !cats[name]) cats[name] = 0;
    });
  } catch(e) {}

  var body = document.getElementById('cat-sidebar-body');
  var html = '<div class="cat-sidebar-item active" data-cat="all" onclick="filterByCat(\'all\',this)"><i class="fa-solid fa-border-all"></i> Tüm Ürünler <span class="cat-count">'+allProducts.length+'</span></div>';

  Object.keys(cats).forEach(function(cat) {
    var icon = CAT_ICONS[cat] || 'fa-tag';
    html += '<div class="cat-sidebar-item" data-cat="'+escHtml(cat)+'" onclick="filterByCat(\''+escJs(cat)+'\',this)">'+
      '<i class="fa-solid '+icon+'"></i> '+escHtml(cat)+
      '<span class="cat-count">'+cats[cat]+'</span>'+
    '</div>';
  });
  body.innerHTML = html;
}

function openCatSidebar()  { document.getElementById('cat-sidebar-overlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCatSidebar() { document.getElementById('cat-sidebar-overlay').classList.remove('open'); document.body.style.overflow = ''; }
function handleCatOverlayClick(e) { if (e.target === document.getElementById('cat-sidebar-overlay')) closeCatSidebar(); }

function filterByCat(cat, el) {
  activeCategory = cat;
  searchQuery    = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  document.querySelectorAll('.cat-sidebar-item').forEach(function(c) { c.classList.remove('active'); });
  if (el) el.classList.add('active');
  closeCatSidebar();
  applyFiltersAndSort();
}

/* ── SIRA & FİLTRE ── */
function setSort(sort, el) {
  currentSort = sort;
  document.querySelectorAll('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
  if (el) el.classList.add('active');
  applyFiltersAndSort();
}

function handleSearch(val) {
  searchQuery = val.trim().toLowerCase();
  document.getElementById('search-clear').style.display = val ? 'block' : 'none';
  applyFiltersAndSort();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  handleSearch('');
}

function applyFiltersAndSort() {
  var result = allProducts.filter(function(p) {
    var catOk    = activeCategory === 'all' || p.category === activeCategory;
    var searchOk = !searchQuery ||
      (p.name||'').toLowerCase().includes(searchQuery) ||
      (p.category||'').toLowerCase().includes(searchQuery) ||
      (p.description||'').toLowerCase().includes(searchQuery);
    var saleOk   = currentSort === 'sale' ? (p.salePrice && p.salePrice < p.price) : true;
    return catOk && searchOk && saleOk;
  });

  // Sıralama
  if (currentSort === 'price-asc') {
    result.sort(function(a,b){ return (a.salePrice||a.price) - (b.salePrice||b.price); });
  } else if (currentSort === 'price-desc') {
    result.sort(function(a,b){ return (b.salePrice||b.price) - (a.salePrice||a.price); });
  } else if (currentSort === 'newest') {
    result.sort(function(a,b){
      var ta = a.createdAt ? (a.createdAt.seconds||0) : 0;
      var tb = b.createdAt ? (b.createdAt.seconds||0) : 0;
      return tb - ta;
    });
  } else if (currentSort === 'rating') {
    result.sort(function(a,b){ return (b._avgRating||0) - (a._avgRating||0); });
  }

  filteredProducts = result;
  document.getElementById('sort-result').textContent = result.length + ' ürün';
  renderProducts(result);
}

/* ── ÜRÜN RENDER (çoklu görsel destekli) ── */
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
    var pct     = isSale ? (p.discountPct || Math.round((1-p.salePrice/p.price)*100)) : 0;
    var delay   = Math.min(i * 35, 350);

    /* Görsel listesi: imageUrls dizisi VEYA tekil imageUrl */
    var imgList = [];
    if (Array.isArray(p.imageUrls) && p.imageUrls.length > 0) {
      imgList = p.imageUrls;
    } else if (p.imageUrl) {
      imgList = [p.imageUrl];
    } else {
      imgList = [''];
    }

    var sliderId = 'slider-'+p.id;
    var fallback = "this.style.background='var(--surface-3)'";

    var slidesHtml = imgList.map(function(url,si){
      return '<img class="img-slide" src="'+escHtml(url)+'" alt="'+escHtml(p.name)+'" loading="'+(si===0?'eager':'lazy')+'" onerror="'+fallback+'" />';
    }).join('');

    var dotsHtml = imgList.length > 1
      ? '<div class="img-dots">' + imgList.map(function(_,di){
          return '<div class="img-dot'+(di===0?' active':'')+'" onclick="goSlide(event,\''+p.id+'\','+di+')"></div>';
        }).join('') + '</div>' : '';

    var navHtml = imgList.length > 1
      ? '<div class="img-nav img-nav-prev" onclick="slideImg(event,\''+p.id+'\',-1)"><i class="fa-solid fa-chevron-left"></i></div>' +
        '<div class="img-nav img-nav-next" onclick="slideImg(event,\''+p.id+'\',1)"><i class="fa-solid fa-chevron-right"></i></div>'
      : '';

    var badgeHtml = isSale
      ? '<div class="badge-firsat"><i class="fa-solid fa-bolt"></i> Fırsat</div><div class="badge-pct">%'+pct+'</div>' : '';

    var stockHtml = !isStock ? '<div class="out-stock-overlay"><span>Stok Tükendi</span></div>' : '';

    var ratingHtml = '';
    if (p._ratingCount > 0) {
      var stars = '';
      for (var s=1;s<=5;s++) stars += '<i class="fa-'+(s<=Math.round(p._avgRating)?'solid':'regular')+' fa-star"></i>';
      ratingHtml = '<div class="p-card__rating"><div class="stars">'+stars+'</div><span>('+p._ratingCount+')</span></div>';
    }

    var priceHtml = isSale
      ? '<span class="price-new">'+fmt(p.salePrice)+'</span><span class="price-old">'+fmt(p.price)+'</span>'
      : '<span class="price-new normal">'+fmt(p.price)+'</span>';

    var cartBtn = isStock
      ? '<button class="btn-cart" onclick="addToCart(\''+escJs(p.id)+'\',event)"><i class="fa-solid fa-bag-shopping"></i> Sepete Ekle</button>'
      : '<button class="btn-cart" disabled style="opacity:.4;cursor:not-allowed;"><i class="fa-solid fa-ban"></i> Tükendi</button>';

    return (
      '<div class="p-card" style="animation-delay:'+delay+'ms" onclick="goToProduct(event,\''+escJs(p.id)+'\')">' +
        '<div class="p-card__img">' +
          '<div class="img-slider" id="'+sliderId+'" data-idx="0" data-count="'+imgList.length+'">'+slidesHtml+'</div>' +
          dotsHtml + navHtml + badgeHtml + stockHtml +
        '</div>' +
        '<div class="p-card__body">' +
          '<div class="p-card__cat">'+escHtml(p.category||'')+'</div>' +
          '<div class="p-card__name">'+escHtml(p.name)+'</div>' +
          ratingHtml +
          '<div class="p-card__price">'+priceHtml+'</div>' +
        '</div>' +
        '<div class="p-card__footer">'+cartBtn+'</div>' +
      '</div>'
    );
  }).join('');
}

/* Görsel kaydırma */
function slideImg(e, id, dir) {
  e.stopPropagation();
  var slider = document.getElementById('slider-'+id);
  if (!slider) return;
  var cur   = parseInt(slider.dataset.idx) || 0;
  var count = parseInt(slider.dataset.count) || 1;
  var next  = (cur + dir + count) % count;
  goSlide(e, id, next);
}

function goSlide(e, id, idx) {
  e.stopPropagation();
  var slider = document.getElementById('slider-'+id);
  if (!slider) return;
  slider.style.transform = 'translateX(-'+idx+'00%)';
  slider.dataset.idx = idx;
  var card = slider.closest('.p-card');
  if (!card) return;
  card.querySelectorAll('.img-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === idx);
  });
}

/* Ürün detay sayfası */
function goToProduct(e, id) {
  if (e.target.closest('.btn-cart') || e.target.closest('.img-nav') || e.target.closest('.img-dot')) return;
  window.location.href = 'product-detail.html?id=' + id;
}

/* ── SEPET ── */
function addToCart(id, e) {
  if (e) e.stopPropagation();
  var product = allProducts.find(function(p){ return p.id === id; });
  if (!product) return;
  var price = (product.salePrice && product.salePrice < product.price) ? product.salePrice : product.price;
  var imgs = Array.isArray(product.imageUrls) && product.imageUrls.length > 0 ? product.imageUrls : [product.imageUrl||''];
  var existing = cart.find(function(c){ return c.id === id; });
  if (existing) { existing.qty += 1; }
  else { cart.push({ id:id, name:product.name, price:price, imageUrl:imgs[0]||'', qty:1 }); }
  saveCart(); updateCartBadge(); renderCart();
  showToast(product.name + ' sepete eklendi', 'success');
  var btn = e && e.target.closest('.btn-cart');
  if (btn) {
    btn.classList.add('added');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Eklendi';
    setTimeout(function(){
      btn.classList.remove('added');
      btn.innerHTML = '<i class="fa-solid fa-bag-shopping"></i> Sepete Ekle';
    }, 1600);
  }
}

function removeFromCart(id) {
  cart = cart.filter(function(c){ return c.id !== id; });
  saveCart(); updateCartBadge(); renderCart();
}

function changeQty(id, delta) {
  var item = cart.find(function(c){ return c.id === id; });
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  saveCart(); updateCartBadge(); renderCart();
}

function clearCart() {
  cart = []; saveCart(); updateCartBadge(); renderCart();
  showToast('Sepet temizlendi.', 'info');
}

function saveCart() { localStorage.setItem('akif_cart', JSON.stringify(cart)); }

function updateCartBadge() {
  var total = cart.reduce(function(s,c){ return s+c.qty; }, 0);
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
        '<img class="cart-item-img" src="'+escHtml(item.imageUrl)+'" alt="" onerror="this.style.display=\'none\'" />' +
        '<div class="cart-item-info">' +
          '<div class="cart-item-name">'+escHtml(item.name)+'</div>' +
          '<div class="cart-item-price">'+fmt(item.price)+'</div>' +
          '<div class="cart-item-qty">' +
            '<div class="qty-btn" onclick="changeQty(\''+escJs(item.id)+'\', -1)"><i class="fa-solid fa-minus"></i></div>' +
            '<span class="qty-num">'+item.qty+'</span>' +
            '<div class="qty-btn" onclick="changeQty(\''+escJs(item.id)+'\', 1)"><i class="fa-solid fa-plus"></i></div>' +
          '</div>' +
        '</div>' +
        '<i class="fa-solid fa-xmark cart-item-remove" onclick="removeFromCart(\''+escJs(item.id)+'\')"></i>' +
      '</div>'
    );
  }).join('');

  var subtotal = cart.reduce(function(s,c){ return s + c.price * c.qty; }, 0);
  document.getElementById('cart-summary').innerHTML =
    '<div class="cart-sum-row"><span>Ara Toplam</span><span>'+fmt(subtotal)+'</span></div>' +
    '<div class="cart-sum-row"><span>Kargo</span><span style="color:var(--green);">Ücretsiz</span></div>' +
    '<div class="cart-sum-row total"><span>Toplam</span><span>'+fmt(subtotal)+'</span></div>';
  footer.style.display = 'block';
}

function openCart()  { document.getElementById('cart-overlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { document.getElementById('cart-overlay').classList.remove('open'); document.body.style.overflow = ''; }
function handleCartOverlayClick(e) { if (e.target === document.getElementById('cart-overlay')) closeCart(); }

/* ── CHECKOUT AKIŞI ── */
function openCheckout() {
  if (!cart.length) { showToast('Sepetiniz boş.', 'error'); return; }
  if (!currentUser) { showToast('Sipariş için önce giriş yapın.', 'error'); return; }
  closeCart();
  checkoutStep = 1;
  renderCheckoutStep(1);
  document.getElementById('checkout-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCheckout() {
  document.getElementById('checkout-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleCheckoutOverlayClick(e) {
  if (e.target === document.getElementById('checkout-overlay')) closeCheckout();
}

function renderCheckoutStep(step) {
  for (var i=1;i<=3;i++) {
    document.getElementById('co-step-'+i).classList.toggle('active', i === step);
  }
  for (var j=1;j<=3;j++) {
    var ind = document.getElementById('step-indicator-'+j);
    ind.className = 'checkout-step';
    if (j < step) ind.classList.add('done');
    if (j === step) ind.classList.add('active');
  }

  var titles = {1:'Sipariş Özeti', 2:'Teslimat Bilgileri', 3:'Sipariş Onayı'};
  document.getElementById('checkout-head-title').textContent = titles[step] || 'Sipariş Ver';

  document.getElementById('co-btn-back').style.display = (step > 1 && step < 3) ? 'block' : 'none';

  var nextBtn = document.getElementById('co-btn-next');
  nextBtn.classList.remove('loading');
  if (step === 3) {
    nextBtn.querySelector('.lbl').innerHTML = '<i class="fa-solid fa-check"></i> Tamam';
  } else if (step === 2) {
    nextBtn.querySelector('.lbl').innerHTML = '<i class="fa-brands fa-whatsapp"></i> WhatsApp ile Gönder';
  } else {
    nextBtn.querySelector('.lbl').innerHTML = 'Devam Et <i class="fa-solid fa-arrow-right"></i>';
  }

  if (step === 1) {
    var html = cart.map(function(item){
      return '<div class="co-item"><img src="'+escHtml(item.imageUrl)+'" alt="" onerror="this.style.display=\'none\'" />' +
        '<div class="co-item-info"><div class="co-item-name">'+escHtml(item.name)+'</div><div class="co-item-sub">'+item.qty+' adet × '+fmt(item.price)+'</div></div>' +
        '<div class="co-item-price">'+fmt(item.price * item.qty)+'</div></div>';
    }).join('');
    document.getElementById('co-items-list').innerHTML = html;
    var total = cart.reduce(function(s,c){ return s+c.price*c.qty; },0);
    document.getElementById('co-subtotal').textContent = fmt(total);
    document.getElementById('co-total').textContent    = fmt(total);

    if (currentUser) {
      if (!document.getElementById('co-name').value) document.getElementById('co-name').value = currentUser.displayName || '';
      if (!document.getElementById('co-phone').value) document.getElementById('co-phone').value = currentUser.phoneNumber || '';
    }
  }
}

async function checkoutNext() {
  if (checkoutStep === 3) { closeCheckout(); return; }

  if (checkoutStep === 2) {
    var name    = document.getElementById('co-name').value.trim();
    var phone   = document.getElementById('co-phone').value.trim();
    var address = document.getElementById('co-address').value.trim();
    if (!name || !phone || !address) {
      showToast('Ad Soyad, telefon ve adres zorunludur.', 'error'); return;
    }
    await placeOrder();
    return;
  }

  checkoutStep++;
  renderCheckoutStep(checkoutStep);
}

function checkoutBack() {
  if (checkoutStep <= 1) return;
  checkoutStep--;
  renderCheckoutStep(checkoutStep);
}

async function placeOrder() {
  var btn = document.getElementById('co-btn-next');
  btn.classList.add('loading');

  var orderData = {
    customer: {
      name:    document.getElementById('co-name').value.trim(),
      phone:   document.getElementById('co-phone').value.trim(),
      address: document.getElementById('co-address').value.trim(),
    },
    items: cart.map(function(item){ return { id:item.id, name:item.name, price:item.price, qty:item.qty }; }),
    total:   cart.reduce(function(s,c){ return s+c.price*c.qty; },0),
    payment: 'whatsapp_form',
    status:  'pending',
    userId:  currentUser ? currentUser.uid : null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    var ref = await db.collection('orders').add(orderData);
    var orderNo = ref.id.slice(-8).toUpperCase();
    var siteBase = location.origin + location.pathname.replace(/\/[^/]*$/, '/');

    var lines = orderData.items.map(function(item){
      return '• ' + item.name + ' x' + item.qty + ' = ' + fmt(item.price * item.qty);
    }).join('\n');

    var waMessage =
      '🛒 *Yeni Sipariş*\n' +
      'Sipariş No: #' + orderNo + '\n\n' +
      '👤 *Müşteri*\n' +
      'Ad Soyad: ' + orderData.customer.name + '\n' +
      'Telefon: ' + orderData.customer.phone + '\n' +
      'Adres: ' + orderData.customer.address + '\n\n' +
      '📦 *Sepet Detayı*\n' + lines + '\n\n' +
      '💳 Toplam: ' + fmt(orderData.total) + '\n' +
      '🔗 Sipariş Kaydı: ' + siteBase + 'admin.html';

    window.open('https://wa.me/' + WHATSAPP_ORDER_NUMBER + '?text=' + encodeURIComponent(waMessage), '_blank');

    document.getElementById('co-order-num').textContent = 'Sipariş No: #' + orderNo;
    document.getElementById('co-confirm-details').innerHTML =
      '<div class="order-detail-row"><span>Müşteri</span><span>'+escHtml(orderData.customer.name)+'</span></div>' +
      '<div class="order-detail-row"><span>Telefon</span><span>'+escHtml(orderData.customer.phone)+'</span></div>' +
      '<div class="order-detail-row"><span>Durum</span><span><span class="badge-gold" style="padding:2px 8px;border-radius:999px;">Bekliyor</span></span></div>' +
      '<div class="order-detail-row"><span>Toplam</span><span style="color:var(--gold);font-weight:700;">'+fmt(orderData.total)+'</span></div>';

    clearCart();
    checkoutStep = 3;
    renderCheckoutStep(3);
  } catch(err) {
    btn.classList.remove('loading');
    showToast('Sipariş oluşturulamadı: ' + err.message, 'error');
  }
}

/* ── ADMIN GİRİŞ ── */
function openLoginModal()  { document.getElementById('login-modal-overlay').classList.add('open'); }
function closeLoginModal() { document.getElementById('login-modal-overlay').classList.remove('open'); }
function handleLoginOverlayClick(e) { if (e.target === document.getElementById('login-modal-overlay')) closeLoginModal(); }

async function doLogin() {
  var email = document.getElementById('lm-email').value.trim();
  var pw    = document.getElementById('lm-pw').value;
  var btn   = document.getElementById('btn-login-modal');
  var err   = document.getElementById('login-err');
  if (!email || !pw) { err.textContent='E-posta ve şifre zorunludur.'; err.style.display='block'; return; }
  btn.classList.add('loading'); err.style.display='none';
  try {
    await auth.signInWithEmailAndPassword(email, pw);
    window.location.href = 'admin.html';
  } catch(e) {
    btn.classList.remove('loading');
    var map={'auth/wrong-password':'Şifre hatalı.','auth/user-not-found':'Bu e-posta kayıtlı değil.','auth/invalid-credential':'E-posta veya şifre hatalı.'};
    err.textContent = map[e.code] || 'Giriş başarısız.';
    err.style.display = 'block';
  }
}

/* ── TOAST ── */
function showToast(msg, type) {
  type = type || 'info';
  var icons = { success:'fa-circle-check', info:'fa-circle-info', error:'fa-circle-xmark' };
  var el = document.createElement('div');
  el.className = 'toast t-' + type;
  el.innerHTML = '<i class="fa-solid '+(icons[type]||icons.info)+'"></i><span>'+escHtml(msg)+'</span>';
  document.getElementById('toast-root').appendChild(el);
  setTimeout(function(){
    el.style.transition = 'opacity .3s'; el.style.opacity = '0';
    setTimeout(function(){ el.remove(); }, 320);
  }, 2800);
}

/* ── UTILS ── */
function fmt(num){ return Number(num||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:2}); }
function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escJs(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"'); }
