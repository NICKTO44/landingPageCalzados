/* =========================
   SHOESSTORE APP - PARTE 1/4
   CONFIGURACIÓN E INICIALIZACIÓN
   ========================= */

// Configuración de la aplicación
const CONFIG = {
    API_BASE: window.location.origin,
    WHATSAPP_NUMBER: "51960086136", // Se actualizará desde el servidor
    ADMIN_PASSWORD: "Daniela1809",
    DEBOUNCE_DELAY: 300,
    NOTIFICATION_DURATION: 3000,
    LAZY_LOADING_THRESHOLD: '200px'
};

// Estado global de la aplicación
const AppState = {
    currentProducts: [],
    filteredProducts: [],
    currentProduct: null,
    selectedSize: null,
    isConnected: false,
    isLoading: false,
    socket: null,
    observers: {
        image: null,
        grid: null
    }
};

/* =========================
   INICIALIZACIÓN
   ========================= */
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    try {
        showLoadingState();
        setupEventListeners();
        initializeSocket();
        await loadProducts();
        setupLazyLoading();
        setupAccessibility();
        hideLoadingState();
        
        Logger.info('Aplicación inicializada correctamente');
    } catch (error) {
        Logger.error('Error inicializando aplicación:', error);
        showNotification('Error inicializando la aplicación', 'error');
    }
}

function showLoadingState() {
    AppState.isLoading = true;
    const loadingIndicator = document.getElementById('loadingIndicator');
    const productsGrid = document.getElementById('productsGrid');
    
    if (loadingIndicator) loadingIndicator.style.display = 'flex';
    if (productsGrid) productsGrid.style.display = 'none';
}

function hideLoadingState() {
    AppState.isLoading = false;
    const loadingIndicator = document.getElementById('loadingIndicator');
    const productsGrid = document.getElementById('productsGrid');
    
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (productsGrid) productsGrid.style.display = 'grid';
}

/* =========================
   CONEXIÓN SOCKET.IO
   ========================= */
function initializeSocket() {
    try {
        AppState.socket = io({
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true
        });
        
        AppState.socket.on('connect', handleSocketConnect);
        AppState.socket.on('disconnect', handleSocketDisconnect);
        AppState.socket.on('stock_updated', handleStockUpdate);
        AppState.socket.on('products_updated', handleProductsUpdate);
        AppState.socket.on('connect_error', handleSocketError);
        
    } catch (error) {
        Logger.error('Error inicializando socket:', error);
        updateConnectionStatus(false);
    }
}

function handleSocketConnect() {
    AppState.isConnected = true;
    updateConnectionStatus(true);
    showNotification('Conectado al servidor', 'success');
    Logger.info('Socket conectado');
}

function handleSocketDisconnect() {
    AppState.isConnected = false;
    updateConnectionStatus(false);
    showNotification('Conexión perdida. Reintentando...', 'warning');
    Logger.warn('Socket desconectado');
}

function handleSocketError(error) {
    Logger.error('Error de socket:', error);
    updateConnectionStatus(false);
}

function handleStockUpdate(products) {
    AppState.currentProducts = products;
    updateProductsDisplay();
    showNotification('Stock actualizado en tiempo real', 'success');
    Logger.info('Stock actualizado vía socket');
}

function handleProductsUpdate(products) {
    AppState.currentProducts = products;
    renderProducts(AppState.currentProducts);
    populateBrandFilter();
    showNotification('Catálogo actualizado', 'success');
    Logger.info('Productos actualizados vía socket');
}

function updateConnectionStatus(connected = AppState.isConnected) {
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');
    
    if (!dot || !text) return;
    
    if (connected) {
        dot.classList.remove('disconnected');
        text.textContent = 'Conectado';
        text.setAttribute('aria-label', 'Estado: Conectado al servidor');
    } else {
        dot.classList.add('disconnected');
        text.textContent = 'Desconectado';
        text.setAttribute('aria-label', 'Estado: Desconectado del servidor');
    }
}

/* =========================
   API CALLS
   ========================= */
async function loadProducts() {
    try {
        showLoadingState();
        
        const response = await fetch(`${CONFIG.API_BASE}/api/products`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const products = await response.json();
        
        if (!Array.isArray(products)) {
            throw new Error('Formato de datos inválido');
        }
        
        AppState.currentProducts = products;
        
        // Debug: Verificar estructura de precios
        if (products.length > 0) {
            const firstProduct = products[0];
            Logger.info('Estructura del primer producto:', {
                id: firstProduct.id,
                title: firstProduct.title,
                price: firstProduct.price,
                priceType: typeof firstProduct.price,
                rawProduct: firstProduct
            });
        }
        
        renderProducts(products);
        populateBrandFilter();
        
        Logger.info(`${products.length} productos cargados`);
        
    } catch (error) {
        Logger.error('Error cargando productos:', error);
        showErrorState('Error cargando productos. Por favor, recarga la página.');
        throw error;
    } finally {
        hideLoadingState();
    }
}

async function updateStock(updates) {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/admin/stock`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                password: CONFIG.ADMIN_PASSWORD,
                updates
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        Logger.info('Stock actualizado correctamente');
        return result;

    } catch (error) {
        Logger.error('Error actualizando stock:', error);
        throw error;
    }
}

function showErrorState(message) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.innerHTML = `
            <div style="text-align: center; color: var(--color-danger);">
                <p style="font-size: var(--font-size-lg); margin-bottom: 16px;">⚠️ ${message}</p>
                <button class="btn btn-primary" onclick="location.reload()">Recargar página</button>
            </div>
        `;
    }
}
/* =========================
   SHOESSTORE APP - PARTE 2/4
   EVENT LISTENERS Y RENDERS
   ========================= */

/* =========================
   EVENT LISTENERS
   ========================= */
function setupEventListeners() {
    // Búsqueda y filtros
    const searchInput = document.getElementById('searchInput');
    const brandFilter = document.getElementById('brandFilter');
    const showAllBtn = document.getElementById('showAllBtn');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, CONFIG.DEBOUNCE_DELAY));
        searchInput.addEventListener('keydown', handleSearchKeydown);
    }
    
    if (brandFilter) {
        brandFilter.addEventListener('change', handleBrandFilter);
    }
    
    if (showAllBtn) {
        showAllBtn.addEventListener('click', showAllProducts);
    }
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', showAllProducts);
    }

    // Modal producto
    setupProductModalListeners();
    
    // Modal admin
    setupAdminModalListeners();

    // Atajos de teclado globales
    document.addEventListener('keydown', handleGlobalKeyDown);
    
    // Handle errors globalmente
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    // Resize handler para responsive
    window.addEventListener('resize', debounce(handleResize, 250));
}

function setupProductModalListeners() {
    const productModal = document.getElementById('productModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const buyBtn = document.getElementById('buyBtn');

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeProductModal);
    }
    
    if (productModal) {
        productModal.addEventListener('click', (e) => {
            if (e.target === productModal) closeProductModal();
        });
    }
    
    if (buyBtn) {
        buyBtn.addEventListener('click', handleBuyClick);
    }
}

function setupAdminModalListeners() {
    const adminModal = document.getElementById('adminModal');
    const adminClose = document.getElementById('adminClose');
    const saveStock = document.getElementById('saveStock');
    const cancelAdmin = document.getElementById('cancelAdmin');

    if (adminClose) {
        adminClose.addEventListener('click', closeAdminModal);
    }
    
    if (saveStock) {
        saveStock.addEventListener('click', handleSaveStock);
    }
    
    if (cancelAdmin) {
        cancelAdmin.addEventListener('click', closeAdminModal);
    }
    
    if (adminModal) {
        adminModal.addEventListener('click', (e) => {
            if (e.target === adminModal) closeAdminModal();
        });
    }
}

function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const firstProduct = AppState.filteredProducts[0];
        if (firstProduct) {
            openProductModal(firstProduct.id);
        }
    }
}

function handleGlobalKeyDown(e) {
    // Cerrar modales con Escape
    if (e.key === 'Escape') {
        if (document.getElementById('productModal')?.classList.contains('active')) {
            closeProductModal();
        }
        if (document.getElementById('adminModal')?.classList.contains('active')) {
            closeAdminModal();
        }
    }

    // Abrir panel admin con Shift + A
    if (e.shiftKey && e.key === 'A') {
        e.preventDefault();
        openAdminPanel();
    }
    
    // Búsqueda rápida con Ctrl + F o Cmd + F
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }
}

function handleGlobalError(event) {
    Logger.error('Error global capturado:', event.error);
    showNotification('Ha ocurrido un error inesperado', 'error');
}

function handleUnhandledRejection(event) {
    Logger.error('Promise rechazada:', event.reason);
    showNotification('Error en operación asíncrona', 'error');
}

function handleResize() {
    // Reajustar grids y modales si es necesario
    const modal = document.querySelector('.modal.active');
    if (modal) {
        // Recentrar modal si está abierto
        modal.style.alignItems = window.innerHeight < 600 ? 'flex-start' : 'center';
    }
}

/* =========================
   RENDER PRODUCTOS
   ========================= */
function renderProducts(products) {
    const grid = document.getElementById('productsGrid');
    const noResults = document.getElementById('noResults');
    
    if (!grid || !noResults) return;
    
    // Limpiar grid
    grid.innerHTML = '';
    
    if (!products || !products.length) {
        noResults.style.display = 'block';
        grid.style.display = 'none';
        noResults.setAttribute('aria-live', 'polite');
        return;
    }
    
    noResults.style.display = 'none';
    grid.style.display = 'grid';
    
    // Fragment para mejor performance
    const fragment = document.createDocumentFragment();
    
    products.forEach(product => {
        fragment.appendChild(createProductCard(product));
    });
    
    grid.appendChild(fragment);
    AppState.filteredProducts = products;
    
    // Announce para lectores de pantalla
    announceToScreenReader(`Se encontraron ${products.length} productos`);
}

function createProductCard(product) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'gridcell');
    card.setAttribute('data-product-id', product.id);
    
    // Verificar si todas las tallas están agotadas
    const allOut = product.sizes.every(size => size.stock === 0);
    const availableSizes = product.sizes.filter(size => size.stock > 0);
    
    // Descripción accesible
    const accessibleDescription = `${product.title} de ${product.brand}, precio ${formatPrice(product.price)}${allOut ? ', agotado' : `, disponible en tallas ${availableSizes.map(s => s.size).join(', ')}`}`;
    card.setAttribute('aria-label', accessibleDescription);

    // Generar HTML de tallas con mejor accesibilidad
    const sizesHtml = product.sizes.map(size => {
        const isOut = size.stock === 0;
        return `
            <span 
                class="size-tag${isOut ? ' out' : ''}" 
                data-size="${size.size}"
                aria-label="Talla ${size.size}${isOut ? ' agotada' : ' disponible'}"
                ${isOut ? 'aria-disabled="true"' : ''}
            >
                ${size.size}${isOut ? '<span class="size-x" aria-hidden="true">✕</span>' : ''}
            </span>
        `;
    }).join('');

    card.innerHTML = `
        <div class="product-image">
            <img 
                class="lazy-image" 
                data-src="${product.image_url}" 
                alt="${product.title} - ${product.brand}"
                loading="lazy"
                decoding="async"
            >
        </div>
        <div class="product-info">
            <h3 class="product-title">${escapeHtml(product.title)}</h3>
            <p class="product-brand">${escapeHtml(product.brand)}</p>
            <div class="product-price" aria-label="Precio: ${formatPrice(product.price)}">${formatPrice(product.price)}</div>
            <div class="product-sizes" role="list" aria-label="Tallas disponibles">${sizesHtml}</div>
            ${allOut ? 
                '<div class="no-stock-label" role="status" aria-live="polite">Agotado en todas las tallas</div>' : 
                `<button 
                    class="btn btn-primary" 
                    aria-label="Ver detalles de ${product.title}"
                    data-action="view-details"
                >
                    Ver Detalles
                </button>`
            }
        </div>
    `;

    // Event listeners
    if (!allOut) {
        card.addEventListener('click', (e) => {
            // Prevenir doble click en botón
            if (e.target.matches('[data-action="view-details"]')) {
                e.stopPropagation();
            }
            openProductModal(product.id);
        });
        
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openProductModal(product.id);
            }
        });
    } else {
        card.setAttribute('aria-disabled', 'true');
        card.style.opacity = '0.7';
    }

    return card;
}

/* =========================
   BÚSQUEDA Y FILTROS
   ========================= */
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    const brand = document.getElementById('brandFilter')?.value || '';
    filterProducts(query, brand);
}

function handleBrandFilter(e) {
    const brand = e.target.value;
    const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
    filterProducts(query, brand);
}

function filterProducts(query, brand) {
    const filtered = AppState.currentProducts.filter(product => {
        const matchQuery = !query || 
            product.title.toLowerCase().includes(query) || 
            product.brand.toLowerCase().includes(query) ||
            product.sizes.some(size => size.size.toString().includes(query));
            
        const matchBrand = !brand || product.brand === brand;
        return matchQuery && matchBrand;
    });
    
    renderProducts(filtered);
    
    // Analytics de búsqueda (opcional)
    if (query || brand) {
        Logger.info(`Filtro aplicado: "${query}" | Marca: "${brand}" | Resultados: ${filtered.length}`);
    }
}

function populateBrandFilter() {
    const select = document.getElementById('brandFilter');
    if (!select) return;
    
    const currentValue = select.value;
    
    // Limpiar y agregar opción por defecto
    select.innerHTML = '<option value="">Todas las marcas</option>';
    
    // Obtener marcas únicas y ordenarlas
    const brands = [...new Set(AppState.currentProducts.map(product => product.brand))]
        .filter(Boolean)
        .sort();
    
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        select.appendChild(option);
    });
    
    // Restaurar selección anterior si existe
    if (currentValue && brands.includes(currentValue)) {
        select.value = currentValue;
    }
}

function showAllProducts() {
    const searchInput = document.getElementById('searchInput');
    const brandFilter = document.getElementById('brandFilter');
    
    if (searchInput) searchInput.value = '';
    if (brandFilter) brandFilter.value = '';
    
    renderProducts(AppState.currentProducts);
    
    // Focus en búsqueda para UX
    if (searchInput) searchInput.focus();
}
/* =========================
   SHOESSTORE APP - PARTE 3/4
   MODALES Y ADMIN PANEL
   ========================= */

/* =========================
   MODAL PRODUCTO
   ========================= */
function openProductModal(productId) {
    const product = AppState.currentProducts.find(p => p.id === productId);
    if (!product) {
        Logger.warn(`Producto no encontrado: ${productId}`);
        return;
    }

    AppState.currentProduct = product;
    AppState.selectedSize = null;

    // Elementos del modal
    const elements = {
        modal: document.getElementById('productModal'),
        title: document.getElementById('modalTitle'),
        productTitle: document.getElementById('modalProductTitle'),
        brand: document.getElementById('modalBrand'),
        price: document.getElementById('modalPrice'),
        image: document.getElementById('modalImage')
    };

    // Verificar que todos los elementos existen
    const missingElements = Object.entries(elements)
        .filter(([key, element]) => !element)
        .map(([key]) => key);
        
    if (missingElements.length > 0) {
        Logger.error('Elementos faltantes en modal:', missingElements);
        return;
    }

    // Llenar información del modal
    elements.title.textContent = product.title;
    elements.productTitle.textContent = product.title;
    elements.brand.textContent = product.brand;
    elements.price.textContent = formatPrice(product.price);

    // Configurar imagen con lazy loading
    elements.image.src = product.image_url;
    elements.image.alt = `${product.title} - ${product.brand}`;
    elements.image.setAttribute('loading', 'eager'); // Cargar inmediatamente en modal

    renderSizeSelector(product.sizes);

    // Mostrar modal con animación
    elements.modal.classList.add('active');
    elements.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    
    // Focus management
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) {
        closeBtn.focus();
    }
    
    // Trap focus en modal
    trapFocus(elements.modal);
    
    Logger.info(`Modal abierto para producto: ${product.title}`);
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    
    // Limpiar estado
    AppState.selectedSize = null;
    AppState.currentProduct = null;
    
    const sizesContainer = document.getElementById('modalSizes');
    if (sizesContainer) {
        sizesContainer.innerHTML = '';
    }
    
    updateBuyButton();
    
    // Restaurar focus al elemento que abrió el modal
    const productCard = document.querySelector(`[data-product-id="${AppState.currentProduct?.id}"]`);
    if (productCard) {
        productCard.focus();
    }
    
    Logger.info('Modal cerrado');
}

function renderSizeSelector(sizes) {
    const container = document.getElementById('modalSizes');
    if (!container) return;

    container.innerHTML = '';

    sizes.forEach(size => {
        const button = document.createElement('button');
        button.className = 'size-btn' + (size.stock === 0 ? ' disabled' : '');
        button.type = 'button';
        button.textContent = size.size;
        
        // Información de stock para accesibilidad
        const stockInfo = size.stock === 0 ? ' • Agotado' : ` • ${size.stock} disponibles`;
        button.setAttribute('aria-label', `Talla ${size.size}${stockInfo}`);
        button.setAttribute('title', `Talla ${size.size}${stockInfo}`);

        if (size.stock === 0) {
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
        } else {
            button.addEventListener('click', () => selectSize(size.size, button));
            button.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectSize(size.size, button);
                }
            });
        }

        container.appendChild(button);
    });

    updateBuyButton();
}

function selectSize(size, button) {
    if (!button || button.disabled) return;

    AppState.selectedSize = size;
    
    // Actualizar UI
    document.querySelectorAll('#modalSizes .size-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.setAttribute('aria-pressed', 'false');
    });
    
    button.classList.add('selected');
    button.setAttribute('aria-pressed', 'true');
    
    updateBuyButton();
    
    // Announce para lectores de pantalla
    announceToScreenReader(`Talla ${size} seleccionada`);
    
    Logger.info(`Talla seleccionada: ${size}`);
}

function updateBuyButton() {
    const buyBtn = document.getElementById('buyBtn');
    if (!buyBtn) return;
    
    const canBuy = AppState.currentProduct && 
                   AppState.selectedSize && 
                   AppState.currentProduct.sizes.find(s => s.size === AppState.selectedSize)?.stock > 0;
    
    buyBtn.disabled = !canBuy;
    buyBtn.setAttribute('aria-disabled', (!canBuy).toString());
    
    if (canBuy) {
        buyBtn.setAttribute('aria-label', `Comprar ${AppState.currentProduct.title} talla ${AppState.selectedSize} por WhatsApp`);
    } else {
        buyBtn.setAttribute('aria-label', 'Selecciona una talla disponible para comprar');
    }
}

/* =========================
   COMPRA POR WHATSAPP
   ========================= */
function handleBuyClick() {
    if (!AppState.currentProduct || !AppState.selectedSize) {
        showNotification('Selecciona una talla para continuar', 'warning');
        return;
    }

    const product = AppState.currentProduct;
    const selectedSizeObj = product.sizes.find(s => s.size === AppState.selectedSize);
    
    if (!selectedSizeObj || selectedSizeObj.stock === 0) {
        showNotification('La talla seleccionada no está disponible', 'error');
        return;
    }

    // Generar mensaje de WhatsApp
    const message = encodeURIComponent(
        `¡Hola! Me interesa comprar:\n\n` +
        `📦 Producto: ${product.title}\n` +
        `🏷️ Marca: ${product.brand}\n` +
        `📏 Talla: ${AppState.selectedSize}\n` +
        `💰 Precio: ${formatPrice(product.price)}\n\n` +
        `¿Podrías confirmar la disponibilidad y los detalles de envío?`
    );

    const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${message}`;
    
    // Abrir WhatsApp en nueva ventana
    const whatsappWindow = window.open(url, '_blank', 'noopener,noreferrer');
    
    if (!whatsappWindow) {
        // Fallback si el popup fue bloqueado
        window.location.href = url;
    }
    
    // Analytics de conversión
    Logger.info(`Compra iniciada: ${product.title} - Talla ${AppState.selectedSize}`);
    
    // Cerrar modal después de un momento
    setTimeout(() => {
        closeProductModal();
        showNotification('¡Gracias por tu interés! Te redirigimos a WhatsApp', 'success');
    }, 500);
}

/* =========================
   PANEL ADMINISTRADOR
   ========================= */
function openAdminPanel() {
    const password = prompt("🔐 Ingresa la contraseña de administrador:");
    
    if (password === null) return; // Usuario canceló
    
    if (password !== CONFIG.ADMIN_PASSWORD) {
        showNotification('❌ Contraseña incorrecta', 'error');
        return;
    }

    renderAdminPanel();
    
    const modal = document.getElementById('adminModal');
    if (modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        
        // Focus en primer input
        const firstInput = modal.querySelector('input[type="number"]');
        if (firstInput) {
            firstInput.focus();
        }
        
        trapFocus(modal);
    }
    
    Logger.info('Panel admin abierto');
}

function renderAdminPanel() {
    const form = document.getElementById('adminForm');
    if (!form) return;

    form.innerHTML = '';

    if (!AppState.currentProducts.length) {
        form.innerHTML = '<p style="text-align: center; color: var(--color-gray);">No hay productos para administrar</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    AppState.currentProducts.forEach(product => {
        const productDiv = document.createElement('div');
        productDiv.className = 'admin-product';
        
        productDiv.innerHTML = `
            <h3>${escapeHtml(product.title)}</h3>
            <p style="color:var(--color-gray);margin-bottom:12px">${escapeHtml(product.brand)}</p>
            <div class="admin-sizes">
                ${product.sizes.map(size => `
                    <div class="admin-size">
                        <label for="stock_${product.id}_${size.size}">
                            Talla ${size.size}
                        </label>
                        <input 
                            type="number" 
                            id="stock_${product.id}_${size.size}"
                            min="0" 
                            max="999"
                            value="${size.stock}"
                            data-product-id="${product.id}"
                            data-size="${size.size}"
                            data-original-value="${size.stock}"
                            aria-describedby="help_${product.id}_${size.size}"
                        >
                        <div id="help_${product.id}_${size.size}" class="visually-hidden">
                            Stock actual: ${size.stock} unidades
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        fragment.appendChild(productDiv);
    });
    
    form.appendChild(fragment);
    
    // Agregar listeners para cambios
    form.addEventListener('input', handleStockInputChange);
}



/* =========================
   PANEL ADMIN MEJORADO - AGREGAR EN LA PARTE 3
   Agregar después de la función renderAdminPanel()
   ========================= */

function renderAdminPanel() {
    const form = document.getElementById('adminForm');
    if (!form) return;

    form.innerHTML = '';

    // Crear pestañas para organizar mejor
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'admin-tabs';
    tabsContainer.innerHTML = `
        <div class="tab-buttons">
            <button type="button" class="tab-btn active" data-tab="stock">
                <span class="btn-icon">📦</span> Gestionar Stock
            </button>
            <button type="button" class="tab-btn" data-tab="products">
                <span class="btn-icon">➕</span> Agregar Producto
            </button>
        </div>
        <div class="tab-content">
            <div id="stockTab" class="tab-panel active"></div>
            <div id="productsTab" class="tab-panel"></div>
        </div>
    `;

    form.appendChild(tabsContainer);

    // Renderizar contenido de cada pestaña
    renderStockTab();
    renderProductsTab();
    
    // Configurar event listeners para pestañas
    setupTabListeners();
}

function renderStockTab() {
    const stockTab = document.getElementById('stockTab');
    if (!stockTab) return;

    if (!AppState.currentProducts.length) {
        stockTab.innerHTML = '<p style="text-align: center; color: var(--color-gray);">No hay productos para administrar</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    AppState.currentProducts.forEach(product => {
        const productDiv = document.createElement('div');
        productDiv.className = 'admin-product';
        
        productDiv.innerHTML = `
            <div class="product-header">
                <div>
                    <h3>${escapeHtml(product.title)}</h3>
                    <p style="color:var(--color-gray);margin-bottom:12px">${escapeHtml(product.brand)} - S/ ${product.price}</p>
                </div>
                <button type="button" class="btn btn-outline btn-sm delete-product" data-product-id="${product.id}">
                    <span class="btn-icon">🗑️</span> Eliminar
                </button>
            </div>
            <div class="admin-sizes">
                ${product.sizes.map(size => `
                    <div class="admin-size">
                        <label for="stock_${product.id}_${size.size}">
                            Talla ${size.size}
                        </label>
                        <input 
                            type="number" 
                            id="stock_${product.id}_${size.size}"
                            min="0" 
                            max="999"
                            value="${size.stock}"
                            data-product-id="${product.id}"
                            data-size="${size.size}"
                            data-original-value="${size.stock}"
                            aria-describedby="help_${product.id}_${size.size}"
                        >
                        <div id="help_${product.id}_${size.size}" class="visually-hidden">
                            Stock actual: ${size.stock} unidades
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        fragment.appendChild(productDiv);
    });
    
    stockTab.appendChild(fragment);
    
    // Agregar listeners para cambios y eliminación
    stockTab.addEventListener('input', handleStockInputChange);
    stockTab.addEventListener('click', handleProductDelete);
}

function renderProductsTab() {
    const productsTab = document.getElementById('productsTab');
    if (!productsTab) return;

    productsTab.innerHTML = `
        <div class="add-product-form">
            <h3 style="margin-bottom: 20px; color: var(--color-primary);">
                <span class="btn-icon">➕</span> Agregar Nuevo Producto
            </h3>
            
            <div class="form-grid">
                <div class="form-group">
                    <label for="newProductTitle">Título del Producto *</label>
                    <input 
                        type="text" 
                        id="newProductTitle" 
                        placeholder="Ej: Zapato Boni urbanos color azul"
                        maxlength="255"
                        required
                    >
                </div>

                <div class="form-group">
                    <label for="newProductBrand">Marca *</label>
                    <input 
                        type="text" 
                        id="newProductBrand" 
                        placeholder="Ej: Boni"
                        maxlength="100"
                        required
                    >
                </div>

                <div class="form-group">
                    <label for="newProductPrice">Precio (S/) *</label>
                    <input 
                        type="number" 
                        id="newProductPrice" 
                        step="0.01"
                        min="0"
                        max="9999.99"
                        placeholder="74.99"
                        required
                    >
                </div>

                <div class="form-group">
                    <label for="newProductImage">URL de Imagen *</label>
                    <input 
                        type="url" 
                        id="newProductImage" 
                        placeholder="/imagenes/imagen4.jpeg o https://..."
                        maxlength="500"
                        required
                    >
                    <small style="color: var(--color-gray);">
                        Puedes usar rutas locales (/imagenes/...) o URLs externas
                    </small>
                </div>

                <div class="form-group full-width">
                    <label>Tallas y Stock Inicial</label>
                    <div class="sizes-input">
                        <div class="size-grid" id="newProductSizes">
                            <div class="size-item">
                                <input type="text" placeholder="36" class="size-number" maxlength="3">
                                <input type="number" placeholder="0" class="size-stock" min="0" max="999">
                                <button type="button" class="remove-size">✕</button>
                            </div>
                        </div>
                        <button type="button" id="addSizeBtn" class="btn btn-outline btn-sm">
                            <span class="btn-icon">➕</span> Agregar Talla
                        </button>
                    </div>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" id="saveNewProduct" class="btn btn-secondary">
                    <span class="btn-icon">💾</span> Crear Producto
                </button>
                <button type="button" id="clearForm" class="btn btn-outline">
                    <span class="btn-icon">🗑️</span> Limpiar Formulario
                </button>
            </div>
        </div>
    `;

    // Configurar event listeners para el formulario
    setupProductFormListeners();
}

function setupTabListeners() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Actualizar botones activos
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Actualizar paneles activos
            tabPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(targetTab + 'Tab').classList.add('active');
        });
    });
}

function setupProductFormListeners() {
    // Agregar talla
    const addSizeBtn = document.getElementById('addSizeBtn');
    if (addSizeBtn) {
        addSizeBtn.addEventListener('click', addNewSizeInput);
    }

    // Guardar producto
    const saveBtn = document.getElementById('saveNewProduct');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSaveNewProduct);
    }

    // Limpiar formulario
    const clearBtn = document.getElementById('clearForm');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearProductForm);
    }

    // Eliminar tallas
    const sizesContainer = document.getElementById('newProductSizes');
    if (sizesContainer) {
        sizesContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-size')) {
                const sizeItem = e.target.closest('.size-item');
                if (document.querySelectorAll('.size-item').length > 1) {
                    sizeItem.remove();
                } else {
                    showNotification('Debe haber al menos una talla', 'warning');
                }
            }
        });
    }

    // Validación en tiempo real
    const requiredInputs = document.querySelectorAll('#productsTab input[required]');
    requiredInputs.forEach(input => {
        input.addEventListener('input', validateProductForm);
    });
}

function addNewSizeInput() {
    const sizesContainer = document.getElementById('newProductSizes');
    if (!sizesContainer) return;

    const sizeItem = document.createElement('div');
    sizeItem.className = 'size-item';
    sizeItem.innerHTML = `
        <input type="text" placeholder="37" class="size-number" maxlength="3">
        <input type="number" placeholder="0" class="size-stock" min="0" max="999">
        <button type="button" class="remove-size">✕</button>
    `;

    sizesContainer.appendChild(sizeItem);
    
    // Focus en el nuevo input
    const newSizeInput = sizeItem.querySelector('.size-number');
    if (newSizeInput) {
        newSizeInput.focus();
    }
}

function validateProductForm() {
    const title = document.getElementById('newProductTitle')?.value.trim();
    const brand = document.getElementById('newProductBrand')?.value.trim();
    const price = document.getElementById('newProductPrice')?.value;
    const image = document.getElementById('newProductImage')?.value.trim();
    
    const saveBtn = document.getElementById('saveNewProduct');
    if (!saveBtn) return;

    const isValid = title && brand && price && image && parseFloat(price) > 0;
    saveBtn.disabled = !isValid;
    
    if (isValid) {
        saveBtn.classList.remove('btn-disabled');
    } else {
        saveBtn.classList.add('btn-disabled');
    }
}

async function handleSaveNewProduct() {
    try {
        // Recopilar datos del formulario
        const productData = {
            title: document.getElementById('newProductTitle')?.value.trim(),
            brand: document.getElementById('newProductBrand')?.value.trim(),
            price: parseFloat(document.getElementById('newProductPrice')?.value),
            image_url: document.getElementById('newProductImage')?.value.trim()
        };

        // Validar datos básicos
        if (!productData.title || !productData.brand || !productData.price || !productData.image_url) {
            showNotification('Todos los campos marcados con * son obligatorios', 'error');
            return;
        }

        if (productData.price <= 0) {
            showNotification('El precio debe ser mayor a 0', 'error');
            return;
        }

        // Recopilar tallas
        const sizeInputs = document.querySelectorAll('.size-item');
        const sizes = [];
        
        for (const sizeItem of sizeInputs) {
            const sizeNumber = sizeItem.querySelector('.size-number')?.value.trim();
            const sizeStock = parseInt(sizeItem.querySelector('.size-stock')?.value) || 0;
            
            if (sizeNumber) {
                // Verificar que no haya tallas duplicadas
                if (sizes.some(s => s.size === sizeNumber)) {
                    showNotification(`La talla ${sizeNumber} está duplicada`, 'error');
                    return;
                }
                
                sizes.push({
                    size: sizeNumber,
                    stock: sizeStock
                });
            }
        }

        if (sizes.length === 0) {
            showNotification('Debe agregar al menos una talla', 'error');
            return;
        }

        // Mostrar loading
        const saveBtn = document.getElementById('saveNewProduct');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;margin-right:8px;"></span> Creando...';
        }

        // Crear producto
        const newProduct = await createProduct(productData, sizes);
        
        if (newProduct) {
            showNotification(`Producto "${productData.title}" creado exitosamente`, 'success');
            clearProductForm();
            
            // Cambiar a pestaña de stock para ver el producto creado
            document.querySelector('.tab-btn[data-tab="stock"]')?.click();
            
            Logger.info('Producto creado:', newProduct);
        }

    } catch (error) {
        Logger.error('Error creando producto:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        // Restaurar botón
        const saveBtn = document.getElementById('saveNewProduct');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span class="btn-icon">💾</span> Crear Producto';
        }
    }
}

async function createProduct(productData, sizes) {
    const response = await fetch(`${CONFIG.API_BASE}/api/admin/products`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            password: CONFIG.ADMIN_PASSWORD,
            product: productData,
            sizes: sizes
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}

async function handleProductDelete(e) {
    if (!e.target.classList.contains('delete-product')) return;
    
    const productId = parseInt(e.target.dataset.productId);
    const product = AppState.currentProducts.find(p => p.id === productId);
    
    if (!product) return;

    const confirmed = confirm(`¿Estás seguro de eliminar "${product.title}"?\n\nEsta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
        e.target.disabled = true;
        e.target.innerHTML = '<span class="spinner" style="width:12px;height:12px;"></span>';
        
        await deleteProduct(productId);
        
        showNotification(`Producto "${product.title}" eliminado correctamente`, 'success');
        
    } catch (error) {
        Logger.error('Error eliminando producto:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

async function deleteProduct(productId) {
    const response = await fetch(`${CONFIG.API_BASE}/api/admin/products/${productId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            password: CONFIG.ADMIN_PASSWORD
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}

function clearProductForm() {
    const inputs = document.querySelectorAll('#productsTab input');
    inputs.forEach(input => {
        input.value = '';
    });

    // Resetear a una sola talla
    const sizesContainer = document.getElementById('newProductSizes');
    if (sizesContainer) {
        sizesContainer.innerHTML = `
            <div class="size-item">
                <input type="text" placeholder="36" class="size-number" maxlength="3">
                <input type="number" placeholder="0" class="size-stock" min="0" max="999">
                <button type="button" class="remove-size">✕</button>
            </div>
        `;
    }

    validateProductForm();
}




function handleStockInputChange(e) {
    if (e.target.type === 'number') {
        const input = e.target;
        const originalValue = parseInt(input.dataset.originalValue);
        const currentValue = parseInt(input.value) || 0;
        
        // Validación de rango
        if (currentValue < 0) {
            input.value = 0;
            return;
        }
        
        if (currentValue > 999) {
            input.value = 999;
            return;
        }
        
        // Indicar cambios visualmente
        if (currentValue !== originalValue) {
            input.style.borderColor = 'var(--color-warning)';
            input.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
            input.setAttribute('data-changed', 'true');
        } else {
            input.style.borderColor = '';
            input.style.backgroundColor = '';
            input.removeAttribute('data-changed');
        }
        
        // Actualizar contador de cambios
        updateChangesCounter();
    }
}

function updateChangesCounter() {
    const changedInputs = document.querySelectorAll('#adminForm input[data-changed="true"]');
    const saveBtn = document.getElementById('saveStock');
    
    if (saveBtn) {
        const count = changedInputs.length;
        if (count > 0) {
            saveBtn.innerHTML = `<span class="btn-icon" aria-hidden="true">💾</span> Guardar ${count} cambio${count > 1 ? 's' : ''}`;
            saveBtn.classList.add('has-changes');
        } else {
            saveBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">💾</span> Guardar Cambios';
            saveBtn.classList.remove('has-changes');
        }
    }
}

async function handleSaveStock() {
    try {
       const inputs = document.querySelectorAll('#stockTab input[type="number"]');
        const updates = [];
        let hasChanges = false;

        console.log('Total inputs encontrados:', inputs.length);

        Array.from(inputs).forEach((input, index) => {
            // Debug cada input
            console.log(`Input ${index}:`, {
                id: input.id,
                value: input.value,
                datasets: input.dataset,
                productId: input.dataset.productId,
                size: input.dataset.size,
                originalValue: input.dataset.originalValue
            });

            const productId = parseInt(input.dataset.productId);
            const size = input.dataset.size;
            const stock = parseInt(input.value) || 0;
            const originalValue = parseInt(input.dataset.originalValue || 0);
            
            // Verificar que los datos son válidos
            if (isNaN(productId) || !size || size === 'undefined') {
                console.error('Datos inválidos en input:', { productId, size, stock, input: input.outerHTML });
                return; // Saltar este input
            }
            
            if (stock !== originalValue) {
                hasChanges = true;
            }
            
            updates.push({
                productId,
                size,
                stock
            });
        });

        console.log('Updates preparados:', updates);

        if (updates.length === 0) {
            showNotification('No se encontraron datos válidos para actualizar', 'warning');
            return;
        }

        if (!hasChanges) {
            showNotification('No hay cambios para guardar', 'warning');
            return;
        }

        // Mostrar loading
        const saveBtn = document.getElementById('saveStock');
        const cancelBtn = document.getElementById('cancelAdmin');
        
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;margin-right:8px;"></span> Guardando...';
        }
        
        if (cancelBtn) {
            cancelBtn.disabled = true;
        }

        // Deshabilitar todos los inputs durante el guardado
        inputs.forEach(input => {
            input.disabled = true;
        });

        showNotification('Actualizando stock...', 'info');
        
        await updateStock(updates);
        
        // Marcar como guardado exitosamente
        inputs.forEach(input => {
            input.dataset.originalValue = input.value;
            input.style.borderColor = '';
            input.style.backgroundColor = '';
            input.removeAttribute('data-changed');
        });
        
        closeAdminModal();
        showNotification(`Stock actualizado: ${updates.length} cambios aplicados`, 'success');
        
        Logger.info(`Stock actualizado: ${updates.length} cambios aplicados`);

    } catch (error) {
        Logger.error('Error guardando stock:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        // Restaurar estado de los controles
        const saveBtn = document.getElementById('saveStock');
        const cancelBtn = document.getElementById('cancelAdmin');
        const inputs = document.querySelectorAll('#adminForm input[type="number"]');
        
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">💾</span> Guardar Cambios';
        }
        
        if (cancelBtn) {
            cancelBtn.disabled = false;
        }
        
        inputs.forEach(input => {
            input.disabled = false;
        });
    }
}
function closeAdminModal() {
    const modal = document.getElementById('adminModal');
    if (!modal) return;

    // Verificar si hay cambios sin guardar
    const hasUnsavedChanges = document.querySelectorAll('#adminForm input[data-changed="true"]').length > 0;
    
    if (hasUnsavedChanges) {
        const confirmed = confirm('Hay cambios sin guardar. ¿Estás seguro de cerrar?');
        if (!confirmed) return;
    }

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    
    // Limpiar formulario
    const form = document.getElementById('adminForm');
    if (form) {
        form.innerHTML = '';
    }
    
    Logger.info('Panel admin cerrado');
}

/* =========================
   ACTUALIZACIÓN EN TIEMPO REAL
   ========================= */
function updateProductsDisplay() {
    // Re-renderizar productos manteniendo filtros actuales
    const currentQuery = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
    const currentBrand = document.getElementById('brandFilter')?.value || '';
    
    if (!currentQuery && !currentBrand) {
        renderProducts(AppState.currentProducts);
    } else {
        filterProducts(currentQuery, currentBrand);
    }

    // Actualizar modal de producto si está abierto
    if (AppState.currentProduct && document.getElementById('productModal')?.classList.contains('active')) {
        const updatedProduct = AppState.currentProducts.find(p => p.id === AppState.currentProduct.id);
        if (updatedProduct) {
            AppState.currentProduct = updatedProduct;
            
            // Actualizar precio en caso de cambios
            const priceElement = document.getElementById('modalPrice');
            if (priceElement) {
                priceElement.textContent = formatPrice(updatedProduct.price);
            }
            
            renderSizeSelector(updatedProduct.sizes);
            
            // Verificar si la talla seleccionada sigue disponible
            if (AppState.selectedSize) {
                const selectedSizeObj = updatedProduct.sizes.find(s => s.size === AppState.selectedSize);
                if (!selectedSizeObj || selectedSizeObj.stock === 0) {
                    AppState.selectedSize = null;
                    updateBuyButton();
                    announceToScreenReader('La talla seleccionada ya no está disponible');
                    showNotification('La talla seleccionada se agotó', 'warning');
                }
            }
        } else {
            // El producto fue eliminado
            closeProductModal();
            showNotification('El producto ya no está disponible', 'info');
        }
    }

    // Actualizar panel admin si está abierto (preservando cambios no guardados)
    if (document.getElementById('adminModal')?.classList.contains('active')) {
        const currentChanges = new Map();
        
        // Guardar cambios actuales
        document.querySelectorAll('#adminForm input[type="number"]').forEach(input => {
            const key = `${input.dataset.productId}-${input.dataset.size}`;
            currentChanges.set(key, {
                value: input.value,
                changed: input.hasAttribute('data-changed')
            });
        });
        
        // Re-renderizar panel
        renderAdminPanel();
        
        // Restaurar cambios
        currentChanges.forEach((data, key) => {
            const input = document.querySelector(`input[data-product-id="${key.split('-')[0]}"][data-size="${key.split('-')[1]}"]`);
            if (input) {
                input.value = data.value;
                if (data.changed) {
                    input.setAttribute('data-changed', 'true');
                    input.style.borderColor = 'var(--color-warning)';
                    input.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
                }
            }
        });
        
        updateChangesCounter();
    }
}

/* =========================
   SISTEMA DE NOTIFICACIONES MEJORADO
   ========================= */
let notificationQueue = [];
let isShowingNotification = false;

function showNotification(message, type = 'info', duration = CONFIG.NOTIFICATION_DURATION) {
    // Agregar a la cola si hay una notificación activa
    if (isShowingNotification) {
        notificationQueue.push({ message, type, duration });
        return;
    }

    const notification = document.getElementById('notification');
    if (!notification) return;

    isShowingNotification = true;

    // Limpiar clases anteriores
    notification.className = 'notification';
    notification.textContent = message;
    notification.classList.add(type, 'show');
    
    // Agregar icono según el tipo
    const icons = {
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'info': 'ℹ️'
    };
    
    if (icons[type]) {
        notification.textContent = `${icons[type]} ${message}`;
    }
    
    // Auto-hide después del tiempo configurado
    const timeoutId = setTimeout(() => {
        hideNotification();
    }, duration);
    
    // Permitir cerrar manualmente
    const closeHandler = () => {
        clearTimeout(timeoutId);
        hideNotification();
    };
    
    notification.addEventListener('click', closeHandler, { once: true });
    
    // Cerrar con teclado (Escape)
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            clearTimeout(timeoutId);
            hideNotification();
            document.removeEventListener('keydown', keyHandler);
        }
    };
    
    document.addEventListener('keydown', keyHandler);
    
    // Announce para lectores de pantalla
    announceToScreenReader(message);
    
    Logger.info(`Notificación [${type}]: ${message}`);
}

function hideNotification() {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.classList.remove('show');
    }
    
    isShowingNotification = false;
    
    // Mostrar siguiente notificación en la cola
    if (notificationQueue.length > 0) {
        const next = notificationQueue.shift();
        setTimeout(() => {
            showNotification(next.message, next.type, next.duration);
        }, 300); // Pequeña pausa entre notificaciones
    }
}

/* =========================
   HELPERS DE ACCESIBILIDAD
   ========================= */
function announceToScreenReader(message) {
    const liveRegion = document.getElementById('live-region');
    if (liveRegion) {
        // Limpiar primero para forzar el anuncio
        liveRegion.textContent = '';
        
        // Usar setTimeout para asegurar que el cambio se detecte
        setTimeout(() => {
            liveRegion.textContent = message;
        }, 50);
        
        // Limpiar después de un momento para evitar repeticiones
        setTimeout(() => {
            liveRegion.textContent = '';
        }, 1000);
    }
}
/* =========================
   SHOESSTORE APP - PARTE 4/4
   UTILIDADES, LAZY LOADING Y INICIALIZACIÓN FINAL
   ========================= */

/* =========================
   LAZY LOADING DE IMÁGENES
   ========================= */
function setupLazyLoading() {
    if ('IntersectionObserver' in window) {
        // Observer para imágenes lazy
        AppState.observers.image = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    loadImage(img);
                    AppState.observers.image.unobserve(img);
                }
            });
        }, {
            rootMargin: CONFIG.LAZY_LOADING_THRESHOLD
        });

        // Observer para nuevas imágenes agregadas dinámicamente
        AppState.observers.grid = new MutationObserver(() => {
            observeLazyImages();
        });

        // Inicializar observación
        observeLazyImages();
        
        const productsGrid = document.getElementById('productsGrid');
        if (productsGrid) {
            AppState.observers.grid.observe(productsGrid, {
                childList: true,
                subtree: true
            });
        }

    } else {
        // Fallback para navegadores sin IntersectionObserver
        loadAllImages();
    }
}

function observeLazyImages() {
    if (!AppState.observers.image) return;
    
    document.querySelectorAll('.lazy-image:not([src])').forEach(img => {
        AppState.observers.image.observe(img);
    });
}

function loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;

    // Crear imagen temporal para precargar
    const tempImg = new Image();
    
    tempImg.onload = () => {
        img.src = src;
        img.classList.remove('lazy-image');
        img.classList.add('loaded');
    };
    
    tempImg.onerror = () => {
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlbiBubyBkaXNwb25pYmxlPC90ZXh0Pjwvc3ZnPg==';
        img.classList.remove('lazy-image');
        img.classList.add('error');
        Logger.warn(`Error cargando imagen: ${src}`);
    };
    
    tempImg.src = src;
}

function loadAllImages() {
    document.querySelectorAll('.lazy-image').forEach(loadImage);
}

/* =========================
   ACCESIBILIDAD
   ========================= */
function setupAccessibility() {
    // Configurar ARIA labels dinámicos
    updateAriaLabels();
    
    // Skip links para navegación por teclado
    addSkipLinks();
    
    // Configurar anuncios para lectores de pantalla
    setupScreenReaderAnnouncements();
}

function updateAriaLabels() {
    // Actualizar contadores dinámicos
    const grid = document.getElementById('productsGrid');
    if (grid) {
        const productCount = grid.children.length;
        grid.setAttribute('aria-label', `Catálogo con ${productCount} productos`);
    }
}

function addSkipLinks() {
    const skipLink = document.createElement('a');
    skipLink.href = '#products';
    skipLink.textContent = 'Ir al contenido principal';
    skipLink.className = 'skip-link';
    skipLink.style.cssText = `
        position: absolute;
        top: -40px;
        left: 6px;
        background: var(--color-primary);
        color: white;
        padding: 8px;
        text-decoration: none;
        border-radius: 4px;
        z-index: 1000;
        transition: top 0.3s;
    `;
    
    skipLink.addEventListener('focus', () => {
        skipLink.style.top = '6px';
    });
    
    skipLink.addEventListener('blur', () => {
        skipLink.style.top = '-40px';
    });
    
    document.body.insertBefore(skipLink, document.body.firstChild);
}

function setupScreenReaderAnnouncements() {
    // Crear región live para anuncios
    const liveRegion = document.createElement('div');
    liveRegion.id = 'live-region';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'visually-hidden';
    document.body.appendChild(liveRegion);
}

function announceToScreenReader(message) {
    const liveRegion = document.getElementById('live-region');
    if (liveRegion) {
        liveRegion.textContent = message;
        
        // Limpiar después de un momento para evitar repeticiones
        setTimeout(() => {
            liveRegion.textContent = '';
        }, 1000);
    }
}

function trapFocus(element) {
    const focusableElements = element.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    element.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    });
}

/* =========================
   UTILIDADES
   ========================= */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatPrice(price) {
    // Convertir a número si es string
    let numPrice = typeof price === 'string' ? parseFloat(price) : price;
    
    // Validar que sea un número válido
    if (typeof numPrice !== 'number' || isNaN(numPrice) || numPrice < 0) {
        Logger.warn('Precio inválido recibido:', price);
        return 'Precio no disponible';
    }
    
    try {
        return new Intl.NumberFormat('es-PE', {
            style: 'currency',
            currency: 'PEN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numPrice);
    } catch (error) {
        Logger.error('Error formateando precio:', error);
        return `S/ ${numPrice.toFixed(2)}`;
    }
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function validateProductData(product) {
    if (!product || typeof product !== 'object') {
        Logger.warn('Producto inválido:', product);
        return false;
    }
    
    const required = ['id', 'title', 'brand', 'price', 'image_url', 'sizes'];
    const hasRequired = required.every(field => {
        const hasField = product.hasOwnProperty(field);
        if (!hasField) {
            Logger.warn(`Campo faltante en producto ${product.id || 'unknown'}:`, field);
        }
        return hasField;
    });
    
    if (!hasRequired) return false;
    
    // Validar precio específicamente
    const price = parseFloat(product.price);
    if (isNaN(price) || price < 0) {
        Logger.warn(`Precio inválido en producto ${product.id}:`, product.price);
        return false;
    }
    
    // Validar sizes
    if (!Array.isArray(product.sizes) || product.sizes.length === 0) {
        Logger.warn(`Sizes inválidas en producto ${product.id}:`, product.sizes);
        return false;
    }
    
    const validSizes = product.sizes.every(size => {
        const valid = size.hasOwnProperty('size') && 
                     size.hasOwnProperty('stock') && 
                     typeof size.stock === 'number' && 
                     size.stock >= 0;
        
        if (!valid) {
            Logger.warn(`Size inválida en producto ${product.id}:`, size);
        }
        
        return valid;
    });
    
    return validSizes;
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    
    return input
        .trim()
        .replace(/[<>]/g, '') // Remover caracteres peligrosos básicos
        .substring(0, 100); // Limitar longitud
}

/* =========================
   LOGGER SYSTEM
   ========================= */
const Logger = {
    info: (message, ...args) => {
        if (console && console.info) {
            console.info(`[ShoesStore] ${message}`, ...args);
        }
    },
    
    warn: (message, ...args) => {
        if (console && console.warn) {
            console.warn(`[ShoesStore] ${message}`, ...args);
        }
    },
    
    error: (message, ...args) => {
        if (console && console.error) {
            console.error(`[ShoesStore] ${message}`, ...args);
        }
    },
    
    debug: (message, ...args) => {
        if (console && console.debug && window.location.hostname === 'localhost') {
            console.debug(`[ShoesStore] ${message}`, ...args);
        }
    }
};

/* =========================
   PERFORMANCE MONITORING
   ========================= */
const Performance = {
    marks: new Map(),
    
    mark: (name) => {
        if ('performance' in window && performance.mark) {
            performance.mark(name);
            Performance.marks.set(name, Date.now());
        }
    },
    
    measure: (name, startMark, endMark) => {
        if ('performance' in window && performance.measure) {
            try {
                performance.measure(name, startMark, endMark);
                const measure = performance.getEntriesByName(name, 'measure')[0];
                Logger.debug(`Performance: ${name} took ${measure.duration.toFixed(2)}ms`);
                return measure.duration;
            } catch (e) {
                Logger.warn('Error measuring performance:', e);
            }
        }
        return null;
    },
    
    getMetrics: () => {
        if ('performance' in window) {
            return {
                navigation: performance.getEntriesByType('navigation')[0],
                marks: Array.from(Performance.marks.entries()),
                memory: performance.memory ? {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit
                } : null
            };
        }
        return null;
    }
};

/* =========================
   ERROR RECOVERY
   ========================= */
const ErrorRecovery = {
    retryCount: 0,
    maxRetries: 3,
    
    async retryOperation(operation, context = 'operación') {
        for (let i = 0; i <= ErrorRecovery.maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                Logger.warn(`Intento ${i + 1}/${ErrorRecovery.maxRetries + 1} fallido para ${context}:`, error);
                
                if (i === ErrorRecovery.maxRetries) {
                    throw new Error(`${context} falló después de ${ErrorRecovery.maxRetries + 1} intentos: ${error.message}`);
                }
                
                // Esperar antes del siguiente intento (exponential backoff)
                await ErrorRecovery.delay(Math.pow(2, i) * 1000);
            }
        }
    },
    
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    recover: async () => {
        Logger.info('Iniciando recuperación automática...');
        
        try {
            // Intentar reconectar socket
            if (!AppState.isConnected && AppState.socket) {
                AppState.socket.connect();
            }
            
            // Recargar productos si están vacíos
            if (AppState.currentProducts.length === 0) {
                await ErrorRecovery.retryOperation(loadProducts, 'carga de productos');
            }
            
            showNotification('Conexión restaurada', 'success');
            Logger.info('Recuperación completada exitosamente');
            
        } catch (error) {
            Logger.error('Error en recuperación automática:', error);
            showNotification('Error de conexión. Recarga la página', 'error');
        }
    }
};

/* =========================
   ANALYTICS HELPERS (OPCIONAL)
   ========================= */
const Analytics = {
    track: (event, data = {}) => {
        // Implementar tracking aquí (Google Analytics, etc.)
        Logger.debug(`Analytics: ${event}`, data);
        
        // Ejemplo de estructura para diferentes providers
        if (typeof gtag !== 'undefined') {
            gtag('event', event, data);
        }
        
        if (typeof fbq !== 'undefined') {
            fbq('track', event, data);
        }
    },
    
    trackProductView: (product) => {
        Analytics.track('product_view', {
            product_id: product.id,
            product_name: product.title,
            brand: product.brand,
            price: product.price
        });
    },
    
    trackPurchaseIntent: (product, size) => {
        Analytics.track('purchase_intent', {
            product_id: product.id,
            product_name: product.title,
            brand: product.brand,
            size: size,
            price: product.price,
            method: 'whatsapp'
        });
    },
    
    trackSearch: (query, results) => {
        Analytics.track('search', {
            query: query,
            results_count: results
        });
    }
};

/* =========================
   OFFLINE/ONLINE DETECTION
   ========================= */
window.addEventListener('online', () => {
    Logger.info('Conexión restaurada');
    showNotification('Conexión a internet restaurada', 'success');
    ErrorRecovery.recover();
});

window.addEventListener('offline', () => {
    Logger.warn('Conexión perdida');
    showNotification('Sin conexión a internet', 'warning');
});

/* =========================
   SERVICE WORKER REGISTRATION
   ========================= */
if ('serviceWorker' in navigator && 'caches' in window) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            Logger.info('Service Worker registrado:', registration.scope);
            
            // Escuchar actualizaciones
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showNotification('Nueva versión disponible. Recarga para actualizar.', 'info');
                    }
                });
            });
            
        } catch (error) {
            Logger.warn('Error registrando Service Worker:', error);
        }
    });
}

/* =========================
   INIT PERFORMANCE MONITORING
   ========================= */
Performance.mark('app-start');

// Monitorear cuando el DOM está listo
document.addEventListener('DOMContentLoaded', () => {
    Performance.mark('dom-ready');
    Performance.measure('dom-load-time', 'app-start', 'dom-ready');
});

// Monitorear cuando todo está cargado
window.addEventListener('load', () => {
    Performance.mark('page-loaded');
    Performance.measure('page-load-time', 'app-start', 'page-loaded');
    
    // Log métricas después de 3 segundos para estabilizar
    setTimeout(() => {
        const metrics = Performance.getMetrics();
        if (metrics) {
            Logger.debug('Métricas de rendimiento:', metrics);
        }
    }, 3000);
});

/* =========================
   GLOBAL ERROR HANDLING
   ========================= */
window.addEventListener('unhandledrejection', (event) => {
    Logger.error('Unhandled promise rejection:', event.reason);
    
    // Intentar recuperación automática para errores de red
    if (event.reason && event.reason.message && event.reason.message.includes('fetch')) {
        setTimeout(() => ErrorRecovery.recover(), 2000);
    }
});

// Prevenir errores de consola en producción
if (window.location.hostname !== 'localhost') {
    console.warn = () => {};
    console.error = () => {};
}

/* =========================
   EXPORT PARA TESTING (SI ES NECESARIO)
   ========================= */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        AppState,
        formatPrice,
        validateProductData,
        sanitizeInput,
        Logger,
        Performance,
        ErrorRecovery,
        Analytics
    };
}

/* =========================
   INICIALIZACIÓN FINAL
   ========================= */
Logger.info('🚀 ShoesStore App cargada y lista');
Logger.info(`Versión: ${document.querySelector('meta[name="version"]')?.content || '1.0.0'}`);
Logger.info(`Entorno: ${window.location.hostname === 'localhost' ? 'desarrollo' : 'producción'}`);

// Exponer funciones útiles al contexto global para debugging
if (window.location.hostname === 'localhost') {
    window.ShoesStore = {
        state: AppState,
        logger: Logger,
        performance: Performance,
        recovery: ErrorRecovery,
        analytics: Analytics,
        openProduct: openProductModal,
        openAdmin: openAdminPanel
    };
}