(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CasperErrors = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  class HttpError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  return { HttpError };
});
