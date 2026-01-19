// Currency formatting
const formatCurrency = (amount, currency = 'NGN', locale = 'en-NG') => {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return formatter.format(amount);
};

// Format amount in kobo (for Paystack)
const formatAmountInKobo = (amount) => {
  return Math.round(amount * 100);
};

// Format amount from kobo (from Paystack)
const formatAmountFromKobo = (amount) => {
  return amount / 100;
};

// Format percentage
const formatPercentage = (value, decimals = 2) => {
  return `${(value * 100).toFixed(decimals)}%`;
};

// Format date
const formatDate = (date, format = 'YYYY-MM-DD') => {
  const d = new Date(date);
  
  switch (format) {
    case 'YYYY-MM-DD':
      return d.toISOString().split('T')[0];
    case 'DD/MM/YYYY':
      return d.toLocaleDateString('en-GB');
    case 'MM/DD/YYYY':
      return d.toLocaleDateString('en-US');
    case 'DD-MM-YYYY':
      return d.toLocaleDateString('en-GB').split('/').reverse().join('-');
    case 'full':
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    case 'short':
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    default:
      return d.toISOString();
  }
};

// Format date and time
const formatDateTime = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  const d = new Date(date);
  
  switch (format) {
    case 'YYYY-MM-DD HH:mm:ss':
      return d.toISOString().replace('T', ' ').split('.')[0];
    case 'DD/MM/YYYY HH:mm':
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    case 'MM/DD/YYYY HH:mm':
      return d.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    default:
      return d.toISOString();
  }
};

// Format relative time
const formatRelativeTime = (date) => {
  const now = new Date();
  const diff = now - new Date(date);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  } else {
    return 'Just now';
  }
};

// Format phone number
const formatPhoneNumber = (phone, country = 'NG') => {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  if (country === 'NG') {
    // Nigerian phone number formatting
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
      return `+234${cleaned.slice(1)}`;
    } else if (cleaned.length === 10) {
      return `+234${cleaned}`;
    } else if (cleaned.length === 13 && cleaned.startsWith('234')) {
      return `+${cleaned}`;
    }
  }
  
  return phone;
};

// Format payment ID
const formatPaymentId = (paymentId) => {
  if (!paymentId) return '';
  
  // Add hyphens for better readability
  return paymentId.replace(/(.{4})/g, '$1-').slice(0, -1);
};

// Format transaction reference
const formatTransactionRef = (ref) => {
  if (!ref) return '';
  
  // Make it uppercase and add spacing
  return ref.toUpperCase().replace(/(.{4})/g, '$1 ').trim();
};

// Format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format number with commas
const formatNumber = (number, decimals = 0) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(number);
};

// Format progress percentage
const formatProgress = (current, total) => {
  if (total === 0) return 0;
  return Math.round((current / total) * 100);
};

// Format status badge
const formatStatusBadge = (status) => {
  const statusMap = {
    pending: { text: 'Pending', class: 'bg-yellow-100 text-yellow-800' },
    processing: { text: 'Processing', class: 'bg-blue-100 text-blue-800' },
    completed: { text: 'Completed', class: 'bg-green-100 text-green-800' },
    failed: { text: 'Failed', class: 'bg-red-100 text-red-800' },
    refunded: { text: 'Refunded', class: 'bg-gray-100 text-gray-800' },
    cancelled: { text: 'Cancelled', class: 'bg-red-100 text-red-800' }
  };

  return statusMap[status] || { text: status, class: 'bg-gray-100 text-gray-800' };
};

// Format payment type
const formatPaymentType = (type) => {
  const typeMap = {
    donation: 'Donation',
    dues: 'Membership Dues',
    campaign: 'Campaign Contribution',
    event: 'Event Payment',
    merchandise: 'Merchandise Purchase'
  };

  return typeMap[type] || type;
};

// Format currency symbol
const getCurrencySymbol = (currency) => {
  const symbols = {
    NGN: '₦',
    USD: '$',
    GBP: '£',
    EUR: '€'
  };

  return symbols[currency] || currency;
};

// Format amount with currency symbol
const formatAmountWithSymbol = (amount, currency = 'NGN') => {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${formatNumber(amount, 2)}`;
};

// Format mask sensitive data
const maskSensitiveData = (data, type = 'email') => {
  if (!data) return '';
  
  switch (type) {
    case 'email':
      const [username, domain] = data.split('@');
      return `${username.charAt(0)}***@${domain}`;
    case 'phone':
      return data.replace(/(\d{3})\d{3}(\d{4})/, '$1***$2');
    case 'card':
      return data.replace(/(\d{4})\d{8}(\d{4})/, '$1********$2');
    default:
      return data;
  }
};

// Format slug
const formatSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

// Format initials
const formatInitials = (firstName, lastName) => {
  const first = firstName ? firstName.charAt(0).toUpperCase() : '';
  const last = lastName ? lastName.charAt(0).toUpperCase() : '';
  return `${first}${last}`;
};

// Format full name
const formatFullName = (firstName, lastName) => {
  const first = firstName || '';
  const last = lastName || '';
  return `${first} ${last}`.trim();
};

module.exports = {
  formatCurrency,
  formatAmountInKobo,
  formatAmountFromKobo,
  formatPercentage,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatPhoneNumber,
  formatPaymentId,
  formatTransactionRef,
  formatFileSize,
  formatNumber,
  formatProgress,
  formatStatusBadge,
  formatPaymentType,
  getCurrencySymbol,
  formatAmountWithSymbol,
  maskSensitiveData,
  formatSlug,
  formatInitials,
  formatFullName
}; 