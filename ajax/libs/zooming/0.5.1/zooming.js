(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global.Zooming = factory());
}(this, (function () { 'use strict';

// webkit prefix
var prefix = 'WebkitAppearance' in document.documentElement.style ? '-webkit-' : '';
var pressDelay = 200;

var options = {
  defaultZoomable: 'img[data-action="zoom"]',
  enableGrab: true,
  transitionDuration: '.4s',
  transitionTimingFunction: 'cubic-bezier(.4,0,0,1)',
  bgColor: '#fff',
  bgOpacity: 1,
  scaleBase: 1.0,
  scaleExtra: 0.5,
  scrollThreshold: 40,
  onOpen: null,
  onClose: null,
  onGrab: null,
  onRelease: null,
  onBeforeOpen: null,
  onBeforeClose: null,
  onBeforeGrab: null,
  onBeforeRelease: null
};

var sniffTransition = function sniffTransition(el) {
  var ret = {};
  var trans = ['webkitTransition', 'transition', 'mozTransition'];
  var tform = ['webkitTransform', 'transform', 'mozTransform'];
  var end = {
    'transition': 'transitionend',
    'mozTransition': 'transitionend',
    'webkitTransition': 'webkitTransitionEnd'
  };

  trans.some(function (prop) {
    if (el.style[prop] !== undefined) {
      ret.transitionProp = prop;
      ret.transEndEvent = end[prop];
      return true;
    }
  });

  tform.some(function (prop) {
    if (el.style[prop] !== undefined) {
      ret.transformProp = prop;
      ret.transformCssProp = prop.replace(/(.*)Transform/, '-$1-transform');
      return true;
    }
  });

  return ret;
};

var checkTrans = function checkTrans(transitionProp, transformProp) {
  return function setStyle(el, styles, remember) {
    var value = void 0;
    if (styles.transition) {
      value = styles.transition;
      delete styles.transition;
      styles[transitionProp] = value;
    }
    if (styles.transform) {
      value = styles.transform;
      delete styles.transform;
      styles[transformProp] = value;
    }

    var s = el.style;
    var original = {};

    for (var key in styles) {
      if (remember) original[key] = s[key] || '';
      s[key] = styles[key];
    }

    return original;
  };
};

var _this = undefined;

// elements
var body = document.body;
var overlay = document.createElement('div');
var target = void 0;
var parent = void 0;

// state
var shown = false;
var lock = false;
var press = false;
var _grab = false;
var lastScrollPosition = null;

// style
var originalStyles = void 0;
var openStyles = void 0;
var translate = void 0;
var scale = void 0;

var srcThumbnail = void 0;
var imgRect = void 0;
var pressTimer = void 0;

var trans = sniffTransition(overlay);
var transformCssProp = trans.transformCssProp;
var transEndEvent = trans.transEndEvent;
var setStyleHelper = checkTrans(trans.transitionProp, trans.transformProp);

// -----------------------------------------------------------------------------

var api$1 = {

  listen: function listen(el) {
    if (typeof el === 'string') {
      document.querySelectorAll(el).forEach(function (e) {
        return api$1.listen(e);
      });
      return _this;
    }

    el.style.cursor = prefix + 'zoom-in';

    el.addEventListener('click', function (e) {
      e.preventDefault();

      if (shown) api$1.close();else api$1.open(el);
    });

    return _this;
  },

  config: function config(opts) {
    if (!opts) return options;

    for (var key in opts) {
      options[key] = opts[key];
    }

    setStyle$1(overlay, {
      backgroundColor: options.bgColor,
      transition: 'opacity\n        ' + options.transitionDuration + '\n        ' + options.transitionTimingFunction
    });

    return _this;
  },

  open: function open(el) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : options.onOpen;

    if (shown || lock || _grab) return;

    target = typeof el === 'string' ? document.querySelector(el) : el;

    if (target.tagName !== 'IMG') return;

    // onBeforeOpen event
    if (options.onBeforeOpen) options.onBeforeOpen(target);

    shown = true;
    lock = true;
    parent = target.parentNode;

    var img = new Image();
    img.onload = imgOnload();
    img.src = target.getAttribute('src');

    parent.appendChild(overlay);
    setTimeout(function () {
      return overlay.style.opacity = options.bgOpacity;
    }, 30);

    document.addEventListener('scroll', scrollHandler);
    document.addEventListener('keydown', keydownHandler);

    target.addEventListener(transEndEvent, function onEnd() {
      target.removeEventListener(transEndEvent, onEnd);

      if (options.enableGrab) addGrabListeners(target);

      lock = false;

      if (cb) cb(target);
    });

    return _this;
  },

  close: function close() {
    var cb = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : options.onClose;

    if (!shown || lock || _grab) return;
    lock = true;

    // onBeforeClose event
    if (options.onBeforeClose) options.onBeforeClose(target);
    overlay.style.opacity = 0;
    target.style.transform = '';

    document.removeEventListener('scroll', scrollHandler);
    document.removeEventListener('keydown', keydownHandler);

    target.addEventListener(transEndEvent, function onEnd() {
      target.removeEventListener(transEndEvent, onEnd);

      if (options.enableGrab) removeGrabListeners(target);

      shown = false;
      lock = false;
      _grab = false;

      setStyle$1(target, originalStyles);
      parent.removeChild(overlay);

      // downgrade source if possible
      if (target.hasAttribute('data-original')) target.setAttribute('src', srcThumbnail);

      if (cb) cb(target);
    });

    return _this;
  },

  grab: function grab(x, y, start) {
    var cb = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : options.onGrab;

    if (!shown || lock) return;
    _grab = true;

    // onBeforeGrab event
    if (options.onBeforeGrab) options.onBeforeGrab(target);

    var dx = x - window.innerWidth / 2,
        dy = y - window.innerHeight / 2;

    var transform = target.style.transform.replace(/translate3d\(.*?\)/i, 'translate3d(' + (translate.x + dx) + 'px, ' + (translate.y + dy) + 'px, 0)').replace(/scale\([0-9|\.]*\)/i, 'scale(' + (scale + options.scaleExtra) + ')');

    setStyle$1(target, {
      cursor: prefix + ' grabbing',
      transition: transformCssProp + ' ' + (start ? options.transitionDuration + ' ' + options.transitionTimingFunction : 'ease'),
      transform: transform
    });

    target.addEventListener(transEndEvent, function onEnd() {
      target.removeEventListener(transEndEvent, onEnd);
      if (cb) cb(target);
    });
  },

  release: function release() {
    var cb = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : options.onRelease;

    if (!shown || lock || !_grab) return;

    // onBeforeRelease event
    if (options.onBeforeRelease) options.onBeforeRelease(target);

    setStyle$1(target, openStyles);

    target.addEventListener(transEndEvent, function onEnd() {
      target.removeEventListener(transEndEvent, onEnd);
      _grab = false;
      if (cb) cb(target);
    });

    return _this;
  }
};

// -----------------------------------------------------------------------------

function setStyle$1(el, styles, remember) {
  return setStyleHelper(el, styles, remember);
}

function imgOnload() {
  imgRect = target.getBoundingClientRect();

  // upgrade source if possible
  if (target.hasAttribute('data-original')) {
    srcThumbnail = target.getAttribute('src');

    setStyle$1(target, {
      width: imgRect.width + 'px',
      height: imgRect.height + 'px'
    });

    target.setAttribute('src', target.getAttribute('data-original'));
  }

  // force layout update
  target.offsetWidth;

  openStyles = {
    position: 'relative',
    zIndex: 999,
    cursor: '' + prefix + (options.enableGrab ? 'grab' : 'zoom-out'),
    transition: transformCssProp + '\n      ' + options.transitionDuration + '\n      ' + options.transitionTimingFunction,
    transform: calculateTransform()
  };

  // trigger transition
  originalStyles = setStyle$1(target, openStyles, true);
}

function calculateTransform() {
  var imgHalfWidth = imgRect.width / 2,
      imgHalfHeight = imgRect.height / 2;


  var imgCenter = {
    x: imgRect.left + imgHalfWidth,
    y: imgRect.top + imgHalfHeight
  };

  var windowCenter = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  };

  // The distance between image edge and window edge
  var distFromImageEdgeToWindowEdge = {
    x: windowCenter.x - imgHalfWidth,
    y: windowCenter.y - imgHalfHeight
  };

  var scaleHorizontally = distFromImageEdgeToWindowEdge.x / imgHalfWidth;
  var scaleVertically = distFromImageEdgeToWindowEdge.y / imgHalfHeight;

  // The vector to translate image to the window center
  translate = {
    x: windowCenter.x - imgCenter.x,
    y: windowCenter.y - imgCenter.y
  };

  // The additional scale is based on the smaller value of
  // scaling horizontally and scaling vertically
  scale = options.scaleBase + Math.min(scaleHorizontally, scaleVertically);

  return 'translate3d(' + translate.x + 'px, ' + translate.y + 'px, 0) scale(' + scale + ')';
}

function addGrabListeners(el) {
  el.addEventListener('mousedown', mousedownHandler);
  el.addEventListener('mousemove', mousemoveHandler);
  el.addEventListener('mouseup', mouseupHandler);
  el.addEventListener('touchstart', touchstartHandler);
  el.addEventListener('touchmove', touchmoveHandler);
  el.addEventListener('touchend', touchendHandler);
}

function removeGrabListeners(el) {
  el.removeEventListener('mousedown', mousedownHandler);
  el.removeEventListener('mousemove', mousemoveHandler);
  el.removeEventListener('mouseup', mouseupHandler);
  el.removeEventListener('touchstart', touchstartHandler);
  el.removeEventListener('touchmove', touchmoveHandler);
  el.removeEventListener('touchend', touchendHandler);
}

// listeners -----------------------------------------------------------------

function scrollHandler() {
  var scrollTop = window.pageYOffset || (document.documentElement || body.parentNode || body).scrollTop;

  if (lastScrollPosition === null) lastScrollPosition = scrollTop;

  var deltaY = lastScrollPosition - scrollTop;

  if (Math.abs(deltaY) >= options.scrollThreshold) {
    lastScrollPosition = null;
    api$1.close();
  }
}

function keydownHandler(e) {
  var code = e.key || e.code;
  if (code === 'Escape' || e.keyCode === 27) api$1.close();
}

function mousedownHandler(e) {
  e.preventDefault();

  pressTimer = setTimeout(function () {
    press = true;
    api$1.grab(e.clientX, e.clientY, true);
  }, pressDelay);
}

function mousemoveHandler(e) {
  if (press) api$1.grab(e.clientX, e.clientY);
}

function mouseupHandler() {
  clearTimeout(pressTimer);
  press = false;
  api$1.release();
}

function touchstartHandler(e) {
  e.preventDefault();

  pressTimer = setTimeout(function () {
    press = true;
    var touch = e.touches[0];
    api$1.grab(touch.clientX, touch.clientY, true);
  }, pressDelay);
}

function touchmoveHandler(e) {
  if (press) {
    var touch = e.touches[0];
    api$1.grab(touch.clientX, touch.clientY);
  }
}

function touchendHandler() {
  clearTimeout(pressTimer);
  press = false;
  if (_grab) api$1.release();else api$1.close();
}

// init ------------------------------------------------------------------------
setStyle$1(overlay, {
  zIndex: 998,
  background: options.bgColor,
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: 0,
  transition: 'opacity\n    ' + options.transitionDuration + '\n    ' + options.transitionTimingFunction
});

overlay.addEventListener('click', api$1.close);

document.addEventListener('DOMContentLoaded', api$1.listen(options.defaultZoomable));

{
  // Enable LiveReload
  document.write('<script src="http://' + (location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1"></' + 'script>');
}

return api$1;

})));
//# sourceMappingURL=zooming.js.map
