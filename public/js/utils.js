
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
            type = thingList.find('input[name="seedType"]').val().split(",");
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
            type = ['node','flow','collection']
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
                var historyUrl = thingUrl.split("?")[1];
                // Need to remove username=xyz/collection=xyzif present
                // If collection is present, remove type= as well
                if (/collection=/.test(historyUrl)) {
                    historyUrl = historyUrl.replace(/&?type=[^&]+/g,"");
                }
                historyUrl = historyUrl.replace(/&?(username|collection)=[^&]+/g,"").replace(/^&/,"");
                if (historyUrl === "page=1") {
                    historyUrl = "";
                }
                historyUrl = location.pathname + (historyUrl.length>0?("?"+historyUrl):"");
                window.history.pushState({},'',historyUrl);
            }
        }
        $(list).children(":not(.gistbox-placeholder)").css("opacity",0.3);
        var done;
        $.getJSON(thingUrl, function(data) {
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
            list.find(".gistbox-tools").on("mouseleave", function(e) { $(this).removeClass("open")})
            if (done) { done(data) }
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

function addToCollection(id) {
    $("body").css({height:"100%",overflow:"hidden"});
    var dialog = $('<div class="dialog-shade"><div class="dialog">'+
        '<h4>Add to collection</h4>'+
        '<div><a class="dialog-create-collection-button" href="/add/collection?addItem='+id+'" style="text-align: left">Create new collection</a></div>'+
        '<div style="position: relative"><select><option value="">Add to existing collection...</option><option disabled>---</option></select><img class="loader" style="position:absolute; top: 10px; left: calc(50% - 16px)" src="/images/spin.svg" /></div>'+
        '<div class="dialog-warning">Failed to add to collection</div>'+
        '<div class="dialog-buttons"><button type="button" onclick="return closeDialog();">Cancel</button></div>'+
        '</div></div>').appendTo('body').show();
    var select = dialog.find("select");
    $.getJSON("/things?format=json&view=summary&username="+loggedInUser+"&type=collection", function(data) {
        data.data.forEach(function(el) {
            $('<option>').attr('value',el._id).text(el.name).appendTo(select);
        })
    })
    select.on("change", function(evt) {
        var collectionId = $(this).val();
        if (collectionId) {
            dialog.find(".dialog-warning").hide();
            select.prop('disabled','disabled');
            dialog.find(".loader").show();
            $.ajax({
                url: "/collection/"+collectionId+"/add/"+id,
                method: "POST",
                data: {},
                success: function(data) {
                    closeDialog();
                }
            }).fail(function(err) {
                dialog.find(".dialog-warning").show();
                select.prop('disabled',false);
                dialog.find(".loader").hide();
            })

        }
    })
    return false;
}

function closeDialog() {
    $("body").css({height:"",overflow:""});
    $(".dialog-shade").hide();
    $(".dialog-shade:not(.dialog-fixed)").remove();
    return false;
}
