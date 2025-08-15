// ============ FEEDBACK VISUAL Y NOTIFICACIONES ============
// Sistema de notificaciones toast, loading states y validación en tiempo real

// ============ NOTIFICACIONES TOAST ============

function showToast(message, type = 'success', duration = 3000) {
  // Crear elemento toast
  const toast = document.createElement('div');
  toast.className = `toast-notification ${type}`;
  toast.textContent = message;
  
  // Añadir al DOM
  document.body.appendChild(toast);
  
  // Auto-eliminar después del tiempo especificado
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// Funciones específicas de toast
function showSuccess(message) {
  showToast(message, 'success');
}

function showError(message) {
  showToast(message, 'error', 5000); // Errores se muestran más tiempo
}

function showWarning(message) {
  showToast(message, 'warning', 4000);
}

// ============ LOADING STATES ============

function setButtonLoading(buttonId, loading = true, originalText = null) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  
  if (loading) {
    // Guardar texto original
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    
    button.classList.add('btn-loading');
    button.disabled = true;
    button.textContent = 'Procesando...';
  } else {
    button.classList.remove('btn-loading');
    button.disabled = false;
    button.textContent = originalText || button.dataset.originalText || button.textContent;
    
    // Limpiar el dataset
    if (button.dataset.originalText) {
      delete button.dataset.originalText;
    }
  }
}

function showLoadingSpinner(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <div class="text-center py-4">
      <div class="loading-spinner"></div>
      <div class="mt-2 text-muted">Cargando...</div>
    </div>
  `;
}

// ============ VALIDACIÓN EN TIEMPO REAL ============

function validateField(fieldId, validationFn, errorMessage = 'Campo inválido') {
  const field = document.getElementById(fieldId);
  if (!field) return false;
  
  const isValid = validationFn(field.value);
  
  // Limpiar clases previas
  field.classList.remove('valid', 'invalid');
  
  // Remover feedback previo
  const existingFeedback = field.parentNode.querySelector('.validation-feedback');
  if (existingFeedback) {
    existingFeedback.remove();
  }
  
  // Aplicar nueva validación
  if (isValid) {
    field.classList.add('valid');
    
    // Añadir feedback positivo
    const feedback = document.createElement('div');
    feedback.className = 'validation-feedback valid';
    feedback.textContent = '✓ Válido';
    field.parentNode.appendChild(feedback);
  } else {
    field.classList.add('invalid');
    
    // Añadir feedback de error
    const feedback = document.createElement('div');
    feedback.className = 'validation-feedback invalid';
    feedback.textContent = errorMessage;
    field.parentNode.appendChild(feedback);
  }
  
  return isValid;
}

// Validaciones comunes
const validators = {
  required: (value) => value && value.trim().length > 0,
  number: (value) => !isNaN(value) && parseFloat(value) >= 0,
  positiveNumber: (value) => !isNaN(value) && parseFloat(value) > 0,
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  percentage: (value) => !isNaN(value) && parseFloat(value) >= 0 && parseFloat(value) <= 100
};

// ============ CONFIRMACIONES MEJORADAS ============

function confirmAction(message, title = 'Confirmar acción') {
  return new Promise((resolve) => {
    // Crear modal de confirmación personalizado
    const modal = document.createElement('div');
    modal.className = 'confirmation-modal';
    modal.innerHTML = `
      <div class="confirmation-content">
        <h6>${title}</h6>
        <p>${message}</p>
        <div class="d-flex gap-2 justify-content-end">
          <button class="btn btn-secondary" id="cancel-action">Cancelar</button>
          <button class="btn btn-danger" id="confirm-action">Confirmar</button>
        </div>
      </div>
    `;
    
    // Estilos inline para el modal
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const content = modal.querySelector('.confirmation-content');
    content.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      max-width: 400px;
      width: 90%;
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    modal.querySelector('#confirm-action').onclick = () => {
      modal.remove();
      resolve(true);
    };
    
    modal.querySelector('#cancel-action').onclick = () => {
      modal.remove();
      resolve(false);
    };
    
    // Cerrar con ESC
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        resolve(false);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

// ============ FUNCIONES UTILES ============

function highlightElement(elementId, duration = 2000) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.style.transition = 'background-color 0.3s ease';
  element.style.backgroundColor = '#fff3cd';
  
  setTimeout(() => {
    element.style.backgroundColor = '';
    setTimeout(() => {
      element.style.transition = '';
    }, 300);
  }, duration);
}

function pulseElement(elementId, times = 3) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  let count = 0;
  const pulse = () => {
    if (count >= times) return;
    
    element.style.transform = 'scale(1.05)';
    element.style.transition = 'transform 0.2s ease';
    
    setTimeout(() => {
      element.style.transform = 'scale(1)';
      count++;
      
      if (count < times) {
        setTimeout(pulse, 400);
      } else {
        setTimeout(() => {
          element.style.transition = '';
          element.style.transform = '';
        }, 200);
      }
    }, 200);
  };
  
  pulse();
}

// ============ INTEGRACIÓN CON SISTEMA EXISTENTE ============

// Sobrescribir alert nativo para usar toast
const originalAlert = window.alert;
window.alert = function(message) {
  // Si el mensaje contiene emojis de éxito, usar toast success
  if (message.includes('✅') || message.toLowerCase().includes('exitosamente') || message.toLowerCase().includes('guardado')) {
    showSuccess(message.replace('✅', '').trim());
  } 
  // Si contiene emojis de error, usar toast error
  else if (message.includes('❌') || message.toLowerCase().includes('error')) {
    showError(message.replace('❌', '').trim());
  }
  // Otros casos, usar toast warning
  else {
    showWarning(message);
  }
};

// Sobrescribir confirm para usar modal personalizado
const originalConfirm = window.confirm;
window.confirm = function(message) {
  // Para compatibilidad inmediata, usar confirm nativo
  // TODO: Migrar gradualmente a confirmAction()
  return originalConfirm(message);
};

// Hacer funciones disponibles globalmente
window.showToast = showToast;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.setButtonLoading = setButtonLoading;
window.showLoadingSpinner = showLoadingSpinner;
window.validateField = validateField;
window.validators = validators;
window.confirmAction = confirmAction;
window.highlightElement = highlightElement;
window.pulseElement = pulseElement;