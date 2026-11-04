/* Live camera (no gallery) and GPS for the visit.
 * Photos are frames grabbed from the live camera preview: they carry no file metadata, and there
 * is no file picker anywhere in the app, so a stored photo cannot be chosen.
 */
(function () {
  'use strict';
  var MAX_EDGE = 1600, QUALITY = 0.85;

  function Camera(video) { this.video = video; this.stream = null; }
  Camera.prototype.start = function () {
    var self = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('This phone\'s browser cannot use the camera. Open the app in Chrome.'));
    }
    return navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(function (stream) {
        self.stream = stream;
        self.video.srcObject = stream;
        self.video.setAttribute('playsinline', '');
        self.video.muted = true;
        return self.video.play();
      }, function (err) {
        var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        throw new Error(denied
          ? 'Camera permission is off. Allow the camera for this site in Chrome\'s settings, then reload.'
          : 'The camera could not be started. Close other apps using it and try again.');
      });
  };
  Camera.prototype.stop = function () {
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  };
  /** Grab the current frame. Resolves {base64, width, height, capturedAt, url}. */
  Camera.prototype.capture = function () {
    var v = this.video;
    if (!v || !v.videoWidth) return Promise.reject(new Error('The camera is not ready yet. Wait a second and try again.'));
    var scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    var w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, w, h);
    if (isBlank(ctx, w, h)) return Promise.reject(new Error('The photo is too dark or blank. Make sure nothing covers the camera.'));
    var capturedAt = new Date().toISOString();
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('The photo could not be made. Try again.')); return; }
        var reader = new FileReader();
        reader.onload = function () {
          resolve({ base64: String(reader.result).split(',')[1], width: w, height: h, capturedAt: capturedAt, url: URL.createObjectURL(blob) });
        };
        reader.onerror = function () { reject(new Error('The photo could not be read. Try again.')); };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', QUALITY);
    });
  };
  function isBlank(ctx, w, h) {
    var d = ctx.getImageData(0, 0, w, h).data, n = 0, sum = 0, sq = 0;
    for (var i = 0; i < d.length; i += 4 * 97) { var y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += y; sq += y * y; n++; }
    var mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    return sd < 6;
  }

  /** Watches GPS and keeps the most accurate recent reading. */
  function Gps(onChange) { this.onChange = onChange; this.best = null; this.id = null; this.error = null; }
  Gps.prototype.start = function () {
    var self = this;
    if (!navigator.geolocation) { this.error = 'This phone\'s browser cannot read GPS.'; this.onChange(this); return; }
    this.id = navigator.geolocation.watchPosition(function (p) {
      var r = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed,
        at: new Date(p.timestamp || Date.now()).toISOString(), ms: p.timestamp || Date.now() };
      // prefer a more accurate reading, but never keep one older than 60 s
      if (!self.best || r.accuracy <= self.best.accuracy || r.ms - self.best.ms > 60000) self.best = r;
      self.error = null;
      self.onChange(self);
    }, function (err) {
      self.error = err.code === 1 ? 'Location permission is off. Allow location for this site in Chrome\'s settings.'
        : 'No GPS signal yet. Move outdoors and wait a moment.';
      self.onChange(self);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  };
  Gps.prototype.stop = function () { if (this.id !== null) navigator.geolocation.clearWatch(this.id); this.id = null; };
  Gps.prototype.reading = function () {
    if (!this.best || Date.now() - this.best.ms > 90000) return null;
    return this.best;
  };

  window.EBM_CAMERA = { Camera: Camera, Gps: Gps };
})();
