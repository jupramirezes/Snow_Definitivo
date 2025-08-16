// ============ NAVEGACIÓN UNIFICADA ============

export class NavigationManager {
  static sections = ['home', 'pos', 'socios', 'admin'];
  
  // ============ INICIALIZAR NAVEGACIÓN ============
  static init() {
    console.log('🧭 Inicializando sistema de navegación...');
    
    // Event listeners para todos los botones de navegación
    document.querySelectorAll('[data-goto]').forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target.dataset.goto;
        this.goTo(target);
      });
    });
    
    // Navegación inicial al home
    this.goTo('home');
    
    console.log('✅ Navegación inicializada');
  }
  
  // ============ NAVEGAR A SECCIÓN ============
  static goTo(sectionId) {
    // Validar que la sección existe
    if (!this.sections.includes(sectionId)) {
      console.error(`❌ Sección inválida: ${sectionId}`);
      return;
    }
    
    // Ocultar todas las secciones
    this.sections.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.hidden = (id !== sectionId);
      }
    });
    
    console.log(`🧭 Navegando a: ${sectionId}`);
    
    // Ejecutar acciones específicas al navegar
    this.onNavigate(sectionId);
  }
  
  // ============ ACCIONES AL NAVEGAR ============
  static onNavigate(sectionId) {
    // Actualizar datos específicos según la sección
    switch(sectionId) {
      case 'home':
        // Actualizar dashboard si está disponible
        if (window.AppState?.dashboard?.refresh) {
          window.AppState.dashboard.refresh();
        }
        break;
        
      case 'pos':
        // Cargar datos de inventario si es necesario
        console.log('📦 Sección POS cargada');
        break;
        
      case 'socios':
        // Cargar datos de socios si es necesario
        console.log('💰 Sección Socios cargada');
        break;
        
      case 'admin':
        // Cargar datos de administración si es necesario
        console.log('⚙️ Sección Admin cargada');
        break;
    }
  }
}