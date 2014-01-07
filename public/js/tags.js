var tagger = function(options) {
    var tags = [];
    options = options||{};
    var lipre = options.lipre||"";
    var lipost = options.lipost||"";
    
    var tagList = $("ul#add-flow-tags");
    var originalTags = [];
    
    
    function formatTag(tag) {
        return lipre.replace(/@@TAG@@/g,tag)+tag+lipost.replace(/@@TAG@@/g,tag);
    }
    
    $("li",tagList).each(function(i,e) {
        var li = $(e);
        var tag = li.attr("tag");
        li.html(tag+' <a href="#"><i class="icon icon-remove"></i></a>');
        $("a",li).click(function(e) {
                removeTag(tag);
                e.preventDefault();
        });
        tags.push(tag);
        originalTags.push(tag);
    });
    
    var listInput =$('<li class="tag-input"><input id="add-flow-tags-input" type="text"></input></li>');
    tagList.append(listInput);
    
    var tagInput = $("#add-flow-tags-input"); 
    tagList.click(function(e) {
            tagInput.focus();
    });
    tagInput.on('focusin',function(e) {
            tagList.addClass("active");
    });
    tagInput.on('focusout',function(e) {
            tagList.removeClass("active");
            var val = tagInput.val();
            if (val != "") {
                addTag(val);
                tagInput.val("");
            }
    });
    tagInput.on('keydown',function(e) {
            if (e.which == 32 || (e.which == 188 && !e.shiftKey)) {
                var val = tagInput.val();
                if (val != "") {
                    if (addTag(val)) {
                        tagInput.val("");
                    }
                }
                e.preventDefault();
            } else if (e.which == 8) {
                var val = tagInput.val();
                if (val == "") {
                    var prevTag = $(this).parent().prev().attr("tag");
                    if (prevTag) {
                        removeTag(prevTag);
                    }
                    e.preventDefault();
                }
            }
    });
    
    function strip() {
        $("li",tagList).each(function(i,e) {
            var li = $(e);
            if (li.hasClass("tag-input")) {
                li.remove();
            } else {
                var tag = $(li).attr("tag");
                li.html(formatTag(tag));
            }
        });
    }
    
    function cancel() {
        $("li",tagList).remove();
        tags = originalTags;
        for (var i in tags) {
            tagList.append($("<li>").html(formatTag(tags[i])).attr("tag",tags[i]));
        }
    }
    function addTag(tag) {
        tag = tag.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        var i = $.inArray(tag,tags);
        if (i==-1) {
            tags.push(tag);
            
            var newtag = $("<li>").html(tag+' <a href="#"><i class="icon icon-remove"></i></a>');
            $(newtag).attr("tag",tag);
            $("a",newtag).click(function(e) {
                    removeTag(tag);
                    e.preventDefault();
            });
            tagInput.parent().before(newtag);
            return true;
        } else {
            var existingTag = $("li[tag='"+tag+"']",tagList);
            existingTag.css({borderColor:'#f00', background:'#fcc'});
            window.setTimeout(function() {
                    existingTag.css({borderColor:'#ccc', background:'#f5f5f5'});
            },1000);
            return false;
        }
    }
    function removeTag(tag) {
        var i = $.inArray(tag,tags);
        if (i!= -1) {
            tags.splice(i,1);
            
            $("li",tagList).each(function(i,e) {
                    if ($(e).attr("tag") == tag) {
                        e.remove();
                    }
            });
        }
    }
    return {
        add:addTag,
        remove:removeTag,
        get:function(){return tags},
        strip: strip,
        cancel: cancel
    };
}
