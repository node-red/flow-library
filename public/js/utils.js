
var utils = (function() {
    function debounce(init, func, wait) {
        var timeout;
        if (wait === undefined) {
            wait = func;
            func = init;
            init = null;
        }

        return function() {
            if (!timeout && init) {
                init();
            }
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                func.apply(context, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    return {
        debounce: debounce
    };
})();