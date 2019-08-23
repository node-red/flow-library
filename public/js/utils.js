
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

    window.onpopstate = function(event) {
        if (event.state) {
            var queryParams = getQueryParams();
            $("#filter-term").val(queryParams.term?queryParams.term[0]:"")
            $(".thing-list").each(function() {
                var thingList = $(this);
                initThingList(thingList);
            });
        }
    }
    function getQueryParams() {
        var queryParams = {};
        location.search.substring(1).split("&").forEach(function(qs) {
            var parts = qs.split("=");
            var k = parts[0];
            var v = parts[1];
            queryParams[k] = queryParams[k] || [];
            queryParams[k].push(v)
        })
        return queryParams;
    }
    function initThingList(thingList) {
        var ignoreQueryParams = !!thingList.find('input[name="ignoreQueryParams"]').val()
        var queryParams = getQueryParams();

        var sort;
        var term;
        var type;
        var page;
        if (ignoreQueryParams) {
            sort = thingList.find('input[name="seedSort"]').val() || "recent";
            term = "";
            type = [thingList.find('input[name="seedType"]').val()];
            page = "";
        } else {
            sort = (queryParams.sort || ["recent"])[0];
            term = queryParams.term?queryParams.term[0]:"";
            type = queryParams.type;
            page = queryParams.page?queryParams.page[0]:"";
        }
        thingList.find('input[name="sort"][value="'+sort+'"]').prop('checked','checked')
        thingList.find('input[name="term"]').val(term);

        if (!type) {
            type = ['node','flow']
        }
        thingList.find('input[name="type"]').prop('checked',false);
        type.forEach(function(t) {
            thingList.find('input[name="type"][value="'+t+'"]').prop('checked','checked')
        });

        thingList.find('input[name="page"]').val(page)
        loadThingList(thingList);
    }

    function loadThingList(thingList, updateUrl, thingUrl) {
        var list = thingList.find(".gistlist");
        if (!thingUrl) {
            thingUrl = "/things"
            var query = thingList.find("form").serialize();
            var components = query.split("&");
            components = components.filter(function(part) {
                return !/^[^=]+=$/.test(part) &&
                        part !== "page=1" &&
                        part !== "sort=recent"
            });
            query = components.join("&")
            if (query.length > 0) {
                thingUrl += "?" + query;
            }
        }
        if (updateUrl) {
            if (history.pushState) {
                // Need to remove username=xyz if present
                var historyUrl = thingUrl.split("?")[1].replace(/username=[^&]+/,"").replace(/^&/,"");
                window.history.pushState({},'',location.pathname+"?"+historyUrl);
            }
        }
        $(list).children(":not(.gistbox-placeholder)").css("opacity",0.3);
        console.log(thingUrl);
        var done;
        $.getJSON(thingUrl, function(data) {
            console.log(data);
            if (data.links.prev) {
                thingList.find(".thing-list-nav-prev").attr("href",data.links.prev).css('opacity', 1);
            } else {
                thingList.find(".thing-list-nav-prev").css('opacity', 0);
            }
            if (data.links.next) {
                thingList.find(".thing-list-nav-next").attr("href",data.links.next).css('opacity', 1);
            } else {
                thingList.find(".thing-list-nav-next").css('opacity', 0);
            }
            if (data.meta.results.count === 0) {
                thingList.find(".thing-list-nav-page-info").hide();
            } else {
                thingList.find(".thing-list-nav-page-info").text(data.meta.pages.current+" of "+data.meta.pages.total).show();
            }
            list.html(data.html);
            if (done) { done() }
        });
        return { then: function(d) { done = d } }
    }

    function loadThingSummary(thingUrl) {
        var done;
        $.getJSON(thingUrl, function(data) {
            if (done)(done(data));
        });
        return { then: function(d) { done = d } }
    }
    return {
        initThingList: initThingList,
        loadThingList:loadThingList,
        loadThingSummary: loadThingSummary,
        debounce: debounce
    };
})();


$(function() {
    $(".thing-list").each(function() {
        var thingList = $(this);

        thingList.find('input').on("change", function(evt) {
            thingList.find('input[name="page"]').val("");
            utils.loadThingList(thingList,true);
        })

        thingList.find('a.thing-list-nav-link').on('click', function(evt) {
            evt.preventDefault();
            utils.loadThingList(thingList,true,$(this).attr('href'));
        })

        utils.initThingList(thingList);
    })
})
