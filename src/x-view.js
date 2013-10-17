(function(){

  var views = {};
  var setAttrProto = Element.prototype.setAttribute;
  var removeAttrProto = Element.prototype.removeAttribute;
 
/*** Prototype Upgrades ***/
 
  Element.prototype.setAttribute = function(name, value){
    if (name == 'view') switchView(this, value);
    setAttrProto.call(this, name, value);
  }
  
  Element.prototype.removeAttribute = function(name){
    if (name == 'view') switchView(this, null);
    removeAttrProto.call(this, name);
  }
  
  Object.defineProperties(Element.prototype, {
  '__view__': { value: null, writable: true },
  'view': {
      get: function(){
        return this.getAttribute('view');
      },
      set: function(value){
        this.setAttribute('view', value);
      }
    }
  });

/*** Internal Methods ***/  

  function createElement(view, tag){
    var node = window.document.createElement(tag);
    if (tag == 'script') node.type = 'view';
    view.appendChild(node);
    return node;
  }
  
  function getElement(view, type){
    return view.querySelector(type) || createElement(view, type);
  }

  function switchView(element, name){
    if (views[element.view]) element.innerHTML = element.__view__ = null;
    if (views[name]) views[name].render(element);
  }
  
  function getMap(view, element){
      return view.xtag.maps[element.nodeName.toLowerCase()] || {};
  }
  
  function getElementValue(element, mapping, key){
    if (mapping){
      var prop = mapping.key || mapping;
      return mapping.action ? mapping.action.call(element, element[prop]) : element[prop];
    }
    else return element[key];
  }
  
  function projectPropertyBindings(view, element, frag){
    var bindings = view.xtag.bindings,
        map = getMap(view, element);
    for (var key in bindings){
      var prop = map[key] || null,
          value = getElementValue(element, prop, key);
      bindings[key].call(frag, value, element);
    }
  }
  
  function addObservers(view, node){
    xtag.addObserver(node, 'inserted', function(el){
      view.render();
    });
    xtag.addObserver(node, 'removed', function(){
      view.render();
    });
  }
  
  function clearEvents(view){
    for (var z in view.xtag.listeners) view.xtag.listeners[z].forEach(function(fn){
      xtag.removeEvent(window.document, z, fn);
    });
  }
  
/*** Pseudos ***/
  
  xtag.pseudos.viewListener = {
    action: function(pseudo, event){
      event.viewTarget = this;
    },
    onCompiled: function(fn, pseudo){
      return function(event){
        var obj = fn.apply(this, xtag.toArray(arguments));
        if (!event.viewTarget) return this;
        var custom = event.viewTarget;
        if (obj && custom && views[custom.view]){
          views[custom.view].updateProperties(event.viewTarget, obj);
        }
        return obj;
      }
    }
  };

  xtag.pseudos.query = {
    action: function(pseudo){
      var fn = pseudo.listener;
      pseudo.listener = function(value, element){
        var args = arguments;
        xtag.query(this, pseudo.value).forEach(function(match){
          fn.call(match, value, element);
        });
      }
    }
  }

/*** Event Listeners ***/
  
  var ready = false;
  window.document.addEventListener('WebComponentsReady', function(){
    ready = true;
    for (var z in views) views[z].render();
  });
  
  xtag.register('x-view', {
    lifecycle: {
      created: function(){
        this.xtag.bindings = {};
        this.xtag.attached = [];
        this.xtag.listeners = {};
        this.xtag.maps = {};
        this.script = this.script.textContent;
        
        if (!window.demo && this.name == 'comment') {
          window.demo = this;
        }
        addObservers(this, this.script);
        addObservers(this, this.template.content);
        
        xtag.fireEvent(window, 'viewready', { detail: { view: this } });
        
        var view = this;
        xtag.query(window.document, '[view="' + this.name + '"]').forEach(function(element){
          view.render(element)
        });
      }
    },
    
    accessors: {
      name: {
        attribute: {},
        set: function(value){
          delete views[this.getAttribute('name')];
          if (value) views[value] = this;
          if (ready) this.render();
        }
      },
      template: {
        get: function(){
          return getElement(this, 'template');
        },
        set: function(html){
          var template = this.querySelector('template');
          if (html.nodeName){
            if (template) this.removeChild(template);
            template = this.appendChild(html);
          }
          else {
            template = template || createElement(this, 'template');
            template.innerHTML = html;
            addObservers(this, template.content);
          }
          this.render();
        }
      },
      script: {
        get: function(){
          return getElement(this, 'script');
        },
        set: function(script){
          clearEvents(this);
          this.script.textContent = String(script);
          this.xtag.scriptFunction = (typeof script == 'function' ? script : new Function(script)).bind(this);
          this.xtag.scriptFunction();
        }
      }
    },
    
    methods:{
      render: function(elements){
        if (ready) {
          var view = this,
              content = this.template.content;
          (elements ? (elements.nodeName ? [elements] : elements) :
            xtag.query(window.document, '[view="' + this.name + '"]')).forEach(function(element){
              element.__view__ = view;
              var frag = content.cloneNode(true);
              projectPropertyBindings(view, element, frag);
              element.innerHTML = '';
              element.appendChild(frag);
          });
        }
      },
      
      update: function(elements){
        var view = this;
        (elements ? (elements.xtag ? [elements] : elements) :
          xtag.query(window.document, '[view="' + this.name + '"]')).forEach(function(element){
            projectPropertyBindings(view, element, element);
        });
      },
      
      addListeners: function(events){
        for (var key in events) {
          var split = key.split(':');
              split.splice(1, 0, 'delegate([view="'+ this.name +'"]):viewListener');
          var join = split.join(':');
          this.xtag.listeners[join] = this.xtag.listeners[join] || [];
          this.xtag.listeners[join].push(xtag.addEvent(window.document, join, events[key]));
        }
      },
      
      removeListener: function(type, fn){
        xtag.removeEvent(window.document, type, fn);
      },
      
      addBindings: function(obj){
        var bindings = this.xtag.bindings;
        for (var key in obj) {
          bindings[key.split(':')[0]] = xtag.applyPseudos(key, obj[key]);
        }
      },
      
      updateProperties: function(element, properties){
        for (var prop in properties){
          this.updateProperty(element, prop, properties[prop], getMap(this, element));
        }
      },
      
      updateProperty: function(element, key, value, map){
        var map = map || getMap(this, element) || {},
            prop = map[key];
        element[prop ? prop.key || prop : key] = value;
      },
      
      updateBindingValue: function(element, key, value){
        var name = this.name,
            bindings = this.xtag.bindings,
            map = getMap(this, element);
        if (bindings[key]){
          bindings[key].call(element, value, element);
          xtag.fireEvent(element, 'viewdatachange', { property: key, value: value });
        }
        for (var item in map){
          if (map[item] == key || map[item].key == key){
            bindings[item].call(element, value, element);
            xtag.fireEvent(element, 'viewdatachange', { property: item, value: value });
          }
        }
      },
      
      mapProperties: function(name, map){
        if (!this.xtag.maps[name]) this.xtag.maps[name] = {};
        this.xtag.maps[name] = map;
        var view = this;
        if (ready) xtag.query(window.document, name + '[view="' + this.name +'"]').forEach(function(element){
          projectPropertyBindings(view, element, element);
        });
      }
    }

  });

})();
