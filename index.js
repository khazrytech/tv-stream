
// DOM Elements
const contentGrid = document.getElementById('contentGrid');
const modalOverlay = document.getElementById('modalOverlay');
const modalVideo = document.getElementById('modalVideo');
const modalTitle = document.getElementById('modalTitle');
const modalClose = document.getElementById('modalClose'); // Ensure this ID exists in HTML
const searchInput = document.getElementById('searchBox'); // Updated ID

// Hero Elements
const heroSlider = document.getElementById('heroSlider');
const heroTitle = document.getElementById('heroTitle');
const heroDescription = document.getElementById('heroDescription');
const heroQuality = document.getElementById('heroQuality');
const heroGenre = document.getElementById('heroGenre');
const heroTag = document.getElementById('heroTag');
const heroWatchBtn = document.getElementById('heroWatchBtn');
const heroFavBtn = document.getElementById('heroFavoriteBtn');
const heroProgress = document.getElementById('heroProgress');

// IPTV Elements
const sportsPlaylistSection = document.getElementById('sportsPlaylist');
const sportsCategoryTabs = document.getElementById('sportsCategoryTabs');
const sportsChannelList = document.getElementById('sportsChannelList');
const sportsPlayer = document.getElementById('sportsPlayer');
const sportsPlayerStatus = document.getElementById('sportsPlayerStatus');
const sportsChannelTitle = document.getElementById('sportsChannelTitle');
const sportsCurrentCategory = document.getElementById('sportsCurrentCategory');

// Related Elements
const relatedChannelsGrid = document.getElementById('relatedChannelsGrid');

// Notification Elements
const notificationsPanel = document.getElementById('notificationsPanel');
const notificationsBody = document.getElementById('notificationsBody');
const notificationBadge = document.getElementById('notificationBadge');
const notificationsBtn = document.getElementById('notificationsBtn');

// State
let streams = [];
let iptvCategories = [];
let iptvCache = {};
let activeSportsCategory = null;
let activeSportsChannelId = null;
let featuredStreams = [];
let currentSlide = 0;
let carouselInterval = null;
let hls = null;
let sportsHls = null;
let notifications = [];
let currentCategory = 'live-tv';
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];

// Embedded fallback data
const EMBEDDED_STREAMS = [
    { id: 1, title: "BBC News", streamUrl: "https://bbc.demo.url/hls/stream.m3u8", category: "News", isFeatured: true, description: "Global news 24/7.", quality: "HD", genre: "News" },
    { id: 2, title: "Sky Sports Main Event", streamUrl: "https://sky.demo.url/hls/stream.m3u8", category: "Sports", isFeatured: true, description: "Live Premier League action.", quality: "FHD", genre: "Sports" },
    { id: 3, title: "HBO Movies", streamUrl: "https://hbo.demo.url/hls/stream.m3u8", category: "Movies", isFeatured: true, description: "Blockbuster movies all day.", quality: "4K", genre: "Drama" }
];

// Initialization
const API_BASE = ''; // Empty for relative paths in production

document.addEventListener('DOMContentLoaded', () => {
    loadStreams();
    loadIptv();
    loadNotifications();
    loadScrollingText();
    loadSettings();
    setupEventListeners();
    startNotificationPolling();
    updateFavoritesButton();
    initAnimations();
});

function setupEventListeners() {
    // Search
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = streams.filter(s => s.title.toLowerCase().includes(term));
            renderChannels(filtered);
            document.getElementById('categoryTitle').textContent = `Search Results: ${term}`;
        });
    }

    // Modal
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Notifications
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', toggleNotificationsPanel);
    }
    document.addEventListener('click', (e) => {
        if (notificationsPanel && notificationsBtn && !notificationsPanel.contains(e.target) && !notificationsBtn.contains(e.target)) {
            notificationsPanel.classList.remove('active');
        }
    });
}

// Data Loading
async function loadStreams() {
    try {
        const res = await fetch(`${API_BASE}/api/streams`);
        if (!res.ok) throw new Error('API Error');
        streams = await res.json();
    } catch (err) {
        console.warn('Using embedded streams due to API error/offset:', err);
        streams = EMBEDDED_STREAMS;
    }
    // showCategory('live-tv'); // filtered initially
    renderChannels(streams); // show all initially or filter?

    // Setup Carousel
    featuredStreams = streams.filter(s => s.isFeatured);
    if (featuredStreams.length === 0) featuredStreams = streams.slice(0, 5);
    if (featuredStreams.length > 0) initCarousel();
}

async function loadIptv() {
    try {
        const res = await fetch(`${API_BASE}/api/iptv-playlists`);
        if (!res.ok) return;
        const data = await res.json();

        // Handle different payload structures
        let categories = [];
        if (data && data.categories) categories = data.categories;
        else if (Array.isArray(data)) categories = data;

        // Normalize categories
        iptvCategories = categories.map((cat, idx) => ({
            key: cat.key || `cat-${idx}`,
            label: cat.label || cat.name || `Playlist ${idx + 1}`,
            url: cat.playlistUrl || cat.url || '',
            channels: cat.channels || []
        }));

        if (iptvCategories.length > 0) {
            sportsPlaylistSection.style.display = 'block';
            renderSportsCategoryTabs();
            selectSportsCategory(iptvCategories[0].key);
        }
    } catch (err) {
        console.log('No IPTV found or server offline', err);
    }
}

// Category Logic
function showCategory(category, btnElement) {
    currentCategory = category;

    // Update active button state
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const titleElement = document.getElementById('categoryTitle');
    if (titleElement) titleElement.textContent = category === 'live-tv' ? 'All Channels' : category.charAt(0).toUpperCase() + category.slice(1);

    // Filter content
    let filtered = streams;
    if (category !== 'live-tv') {
        filtered = streams.filter(s => (s.category || '').toLowerCase() === category.toLowerCase());
    }

    // Special handling for "Sports" to also show IPTV section
    if (category === 'sports') {
        if (sportsPlaylistSection) sportsPlaylistSection.style.display = 'block';
        // Jump to section
        sportsPlaylistSection.scrollIntoView({ behavior: 'smooth' });
    } else {
        // We might want to keep IPTV visible but maybe filtering affects grid mostly
    }

    renderChannels(filtered);
}

// Rendering
function renderChannels(list) {
    if (!contentGrid) return;
    if (!list.length) {
        contentGrid.innerHTML = '<div style="padding:20px; color:#ccc; width:100%; text-align:center;">No channels found in this category.</div>';
        return;
    }
    contentGrid.innerHTML = list.map(stream => `
        <div class="card" onclick="openPlayer('${stream.streamUrl}', '${stream.title.replace(/'/g, "\\'")}', '${stream.category}')">
            <div class="card-image">
                <i class="fas fa-play-circle play-icon"></i>
                <img src="${stream.thumbnail || 'https://via.placeholder.com/300x170/1a1a2e/ffffff?text=' + stream.title.charAt(0)}" alt="${stream.title}">
                <div class="live-badge">LIVE</div>
            </div>
            <div class="card-details">
                <h3>${stream.title}</h3>
                <p>${stream.category || 'Live TV'}</p>
            </div>
        </div>
    `).join('');
}

// Notification Logic
async function loadNotifications() {
    try {
        const res = await fetch(`${API_BASE}/api/notifications`);
        if (!res.ok) return;
        notifications = await res.json();
        updateNotificationBadge();
        renderNotifications();
    } catch (e) {
        console.warn('Failed to load notifications');
    }
}

function renderNotifications() {
    if (!notificationsBody) return;
    if (!notifications.length) {
        notificationsBody.innerHTML = '<div class="notifications-empty">No new notifications.</div>';
        return;
    }
    notificationsBody.innerHTML = notifications
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(n => `
            <div class="notification-item-user ${n.read ? '' : 'unread'}" onclick="markNotificationRead(${n.id})">
                <div class="notification-title-user">${n.title}</div>
                <div class="notification-message-user">${n.message}</div>
                <div class="notification-meta-user">
                    <span>${new Date(n.createdAt).toLocaleTimeString()}</span>
                </div>
            </div>
        `).join('');
}

function updateNotificationBadge() {
    if (!notificationBadge) return;
    const unread = notifications.filter(n => !n.read).length;
    if (unread > 0) {
        notificationBadge.textContent = unread > 99 ? '99+' : unread;
        notificationBadge.style.display = 'flex';
    } else {
        notificationBadge.style.display = 'none';
    }
}

async function markNotificationRead(id) {
    try {
        await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'POST' });
        const n = notifications.find(x => x.id === id);
        if (n) n.read = true;
        updateNotificationBadge();
        renderNotifications();
    } catch (e) { console.error(e); }
}

function toggleNotificationsPanel() {
    if (notificationsPanel) notificationsPanel.classList.toggle('active');
}

function startNotificationPolling() {
    setInterval(loadNotifications, 30000);
}


// --- IPTV / Sports Player Logic ---
function renderSportsCategoryTabs() {
    if (!sportsCategoryTabs) return;
    sportsCategoryTabs.innerHTML = iptvCategories.map(cat => `
        <button class="sports-tab ${cat.key === activeSportsCategory ? 'active' : ''}" 
                onclick="selectSportsCategory('${cat.key}')">
            <span>${cat.label}</span>
            <small>${cat.channels?.length || (cat.count || 0)}</small>
        </button>
    `).join('');
}

async function selectSportsCategory(key) {
    activeSportsCategory = key;
    renderSportsCategoryTabs();

    sportsChannelList.innerHTML = '<div style="padding:20px; text-align:center;">Loading channels...</div>';

    if (iptvCache[key]) {
        renderSportsChannelList(iptvCache[key]);
        return;
    }

    const category = iptvCategories.find(c => c.key === key);
    if (!category) return;

    let channels = [];
    if (category.channels && category.channels.length > 0) {
        channels = category.channels.map((c, i) => ({
            id: `${key}-${i}`,
            title: c.title || c.name,
            logo: c.logo || c.icon,
            url: c.url || c.streamUrl,
            group: c.group || category.label
        }));
    }

    // Always try to fetch from proxy if it's a playlist OR if we just want to get everything consolidated
    try {
        const res = await fetch(`${API_BASE}/api/iptv/proxy/${key}`);
        if (res.ok) {
            const data = await res.json();
            if (data.channels && data.channels.length > 0) {
                channels = data.channels;
            }
        }
    } catch (e) {
        console.warn("Using local fallback for channels due to proxy error", e);
    }

    iptvCache[key] = channels;
    renderSportsChannelList(channels);
    category.count = channels.length;
    renderSportsCategoryTabs();
}

function parseM3U(text, key) {
    const lines = text.split(/\r?\n/);
    const channels = [];
    let current = null;
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        if (line.startsWith('#EXTINF')) {
            const name = line.split(',').pop().trim();
            const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
            const groupMatch = line.match(/group-title="([^"]*)"/i);
            current = {
                title: name,
                logo: logoMatch ? logoMatch[1] : '',
                group: groupMatch ? groupMatch[1] : '',
                key: key
            };
        } else if (!line.startsWith('#') && current) {
            channels.push({
                ...current,
                id: `${key}-${channels.length}`,
                url: line
            });
            current = null;
        }
    });
    return channels;
}

function renderSportsChannelList(channels) {
    if (!channels.length) {
        sportsChannelList.innerHTML = '<div style="padding:20px;">No channels found.</div>';
        return;
    }
    sportsChannelList.innerHTML = channels.map(ch => `
        <button class="channel-item ${ch.id === activeSportsChannelId ? 'active' : ''}" 
                onclick="playSportsChannel('${ch.id}')">
            <img src="${ch.logo || 'https://via.placeholder.com/40/333/fff?text=' + ch.title.charAt(0)}" 
                 onerror="this.src='https://via.placeholder.com/40/333/fff?text=TV'" alt="">
            <div class="channel-info">
                <strong>${ch.title}</strong>
                <span>${ch.group || 'General'}</span>
            </div>
            <i class="fas fa-play" style="font-size: 0.8em; opacity: 0.5;"></i>
        </button>
    `).join('');
}

function playSportsChannel(id) {
    const category = iptvCategories.find(c => c.key === activeSportsCategory);
    if (!iptvCache[activeSportsCategory]) return;
    const channel = iptvCache[activeSportsCategory].find(c => c.id === id);
    if (!channel) return;

    activeSportsChannelId = id;
    renderSportsChannelList(iptvCache[activeSportsCategory]);

    if (sportsChannelTitle) sportsChannelTitle.textContent = channel.title;
    if (sportsCurrentCategory) sportsCurrentCategory.textContent = channel.group || category?.label || 'Live';

    if (sportsHls) {
        sportsHls.destroy();
        sportsHls = null;
    }

    if (sportsPlayerStatus) {
        sportsPlayerStatus.classList.add('active');
        sportsPlayerStatus.style.opacity = '1';
        sportsPlayerStatus.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Connecting...</span>';
    }

    if (Hls.isSupported() && channel.url.endsWith('.m3u8')) {
        sportsHls = new Hls();
        sportsHls.loadSource(channel.url);
        sportsHls.attachMedia(sportsPlayer);
        sportsHls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (sportsPlayerStatus) sportsPlayerStatus.style.opacity = '0';
            sportsPlayer.play();
        });
        sportsHls.on(Hls.Events.ERROR, () => {
            if (sportsPlayerStatus) sportsPlayerStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Signal Error</span>';
        });
    } else {
        sportsPlayer.src = channel.url;
        sportsPlayer.play().then(() => {
            if (sportsPlayerStatus) sportsPlayerStatus.style.opacity = '0';
        }).catch(() => {
            if (sportsPlayerStatus) sportsPlayerStatus.innerHTML = '<i class="fas fa-play"></i><span>Press Play</span>';
        });
    }
}

function refreshSportsCategory() {
    loadIptv();
}


// Carousel Logic
function initCarousel() {
    updateCarousel();
    startAutoSlide();
}

function updateCarousel() {
    if (!featuredStreams.length) return;
    const slide = featuredStreams[currentSlide];

    if (heroSlider) {
        const thumb = slide.thumbnail || `https://source.unsplash.com/1600x900/?${slide.category || 'tv'}`;
        heroSlider.style.background = `linear-gradient(to right, rgba(15, 12, 41, 0.9), rgba(48, 43, 99, 0.5)), url('${thumb}') no-repeat center center/cover`;
    }
    if (heroTitle) heroTitle.textContent = slide.title;
    if (heroDescription) heroDescription.textContent = slide.description || `Watch ${slide.title} live on TV Stream.`;
    if (heroQuality) heroQuality.textContent = slide.quality || 'HD';
    if (heroGenre) heroGenre.textContent = slide.category || 'Live';

    heroWatchBtn.onclick = () => openPlayer(slide.streamUrl, slide.title, slide.category);
    renderProgressDots();
}

function renderProgressDots() {
    if (!heroProgress) return;
    heroProgress.innerHTML = featuredStreams.map((_, idx) => `
        <span class="dot ${idx === currentSlide ? 'active' : ''}" 
              onclick="goToSlide(${idx})">
        </span>
    `).join('');
}

function goToSlide(index) {
    currentSlide = index;
    updateCarousel();
    resetAutoSlide();
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % featuredStreams.length;
    updateCarousel();
}

function startAutoSlide() {
    if (carouselInterval) clearInterval(carouselInterval);
    carouselInterval = setInterval(nextSlide, 5000);
}

function resetAutoSlide() {
    startAutoSlide();
}

// Modern Animations logic
function initAnimations() {
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in-section').forEach(section => {
        observer.observe(section);
    });
}

// Favorites Functions
function updateFavoritesButton() {
    const btn = document.getElementById("favoritesBtn");
    if (!btn) return;
    if (favorites.length > 0) {
        btn.classList.add("active");
        btn.title = `Favorites (${favorites.length})`;
        btn.style.color = 'var(--accent-color)';
    } else {
        btn.classList.remove("active");
        btn.title = "Favorites";
        btn.style.color = '';
    }
}

function toggleFavorite(title) {
    // Logic to add to favorite by title/id, simplifies here
    alert('Added to favorites!');
}

// Player Logic
function openPlayer(url, title, category) {
    if (!url) {
        alert('No stream URL available');
        return;
    }

    modalTitle.textContent = title;
    modalOverlay.classList.add('active');

    renderRelatedChannels(title, category);

    if (Hls.isSupported() && url.endsWith('.m3u8')) {
        if (hls) hls.destroy();
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(modalVideo);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            modalVideo.play();
        });
    } else if (modalVideo.canPlayType('application/vnd.apple.mpegurl') && url.endsWith('.m3u8')) {
        modalVideo.src = url;
        modalVideo.play();
    } else {
        modalVideo.src = url;
        // Try play
        modalVideo.play().catch(e => console.warn(e));
    }
}

function renderRelatedChannels(currentTitle, category) {
    if (!relatedChannelsGrid) return;

    let related = streams.filter(s => s.category === category && s.title !== currentTitle);
    if (related.length < 3) {
        const others = streams.filter(s => s.title !== currentTitle && !related.includes(s));
        related = related.concat(others).slice(0, 8);
    } else {
        related = related.slice(0, 8);
    }

    if (related.length === 0) {
        relatedChannelsGrid.innerHTML = '<span style="color:#aaa; font-size:0.8em;">No related channels.</span>';
        return;
    }

    relatedChannelsGrid.innerHTML = related.map(stream => `
        <div class="related-card" 
             style="min-width: 120px; cursor: pointer; position: relative;"
             onclick="openPlayer('${stream.streamUrl}', '${stream.title.replace(/'/g, "\\'")}', '${stream.category}')">
            <div style="position:relative; width: 100%; height: 70px; border-radius: 8px; overflow: hidden; margin-bottom: 5px;">
                <img src="${stream.thumbnail || 'https://via.placeholder.com/150x80/222/fff?text=' + stream.title.charAt(0)}" 
                     style="width:100%; height:100%; object-fit: cover;" alt="${stream.title}">
                <div style="position:absolute; bottom:4px; right:4px; background:red; color:white; font-size:8px; padding: 2px 4px; border-radius: 2px; font-weight:bold; display: flex; align-items: center; gap: 3px;">
                    <div style="width: 4px; height: 4px; background: white; border-radius: 50%;"></div> LIVE
                </div>
            </div>
            <div style="font-size: 0.8em; color: rgba(255,255,255,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${stream.title}
            </div>
        </div>
    `).join('');
}

function closeModal() {
    modalOverlay.classList.remove('active');
    modalVideo.pause();
    modalVideo.src = '';
    if (hls) hls.destroy();
}

// --- New Features Logic ---

async function loadScrollingText() {
    try {
        const res = await fetch(`${API_BASE}/api/scrolling-text`);
        if (!res.ok) return;
        const messages = await res.json();
        const container = document.getElementById('marqueeContainer');
        const content = document.getElementById('marqueeContent');

        if (messages.length > 0 && container && content) {
            container.style.display = 'block';
            content.innerHTML = messages.map(m =>
                `<span class="marquee-item">${m.text}</span>`
            ).join('<span class="marquee-separator">★</span>');
        }
    } catch (e) {
        console.warn('Failed to load scrolling text');
    }
}

async function loadSettings() {
    try {
        const res = await fetch(`${API_BASE}/api/settings`);
        if (!res.ok) return;
        const settings = await res.json();

        // About
        const aboutSection = document.getElementById('aboutSection');
        if (aboutSection && settings.about && settings.about.content) {
            aboutSection.innerHTML = `<p>${settings.about.content.replace(/\n/g, '<br>')}</p>`;
        }

        // Socials
        const footerSocials = document.getElementById('footerSocials');
        if (footerSocials && settings.social) {
            const { youtube, facebook, instagram } = settings.social;
            let html = '';
            if (youtube && youtube.username) {
                html += `<a href="${youtube.url || '#'}" target="_blank" class="social-link"><i class="fab fa-youtube"></i></a>`;
            }
            if (facebook && facebook.username) {
                html += `<a href="${facebook.url || '#'}" target="_blank" class="social-link"><i class="fab fa-facebook"></i></a>`;
            }
            if (instagram && instagram.username) {
                html += `<a href="${instagram.url || '#'}" target="_blank" class="social-link"><i class="fab fa-instagram"></i></a>`;
            }
            footerSocials.innerHTML = html;
        }
    } catch (e) {
        console.warn('Failed to load settings');
    }
}
