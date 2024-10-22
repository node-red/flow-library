// eslint-disable-next-line no-unused-vars
const tagger = function (options) {
    let tags = []
    options = options || {}
    const lipre = options.lipre || ''
    const lipost = options.lipost || ''

    const tagList = $('ul#add-flow-tags')
    const originalTags = []

    function formatTag (tag) {
        return lipre.replace(/@@TAG@@/g, tag) + tag + lipost.replace(/@@TAG@@/g, tag)
    }

    $('li', tagList).each(function (i, e) {
        const li = $(e)
        const tag = li.attr('tag')
        li.html(tag + ' <a href="#"><i class="icon icon-remove"></i></a>')
        $('a', li).click(function (e) {
            removeTag(tag)
            e.preventDefault()
        })
        tags.push(tag)
        originalTags.push(tag)
    })

    const listInput = $('<li class="tag-input"><input id="add-flow-tags-input" type="text"></input></li>')
    tagList.append(listInput)

    const tagInput = $('#add-flow-tags-input')
    tagList.click(function (e) {
        tagInput.focus()
    })
    tagInput.on('focusin', function (e) {
        tagList.addClass('active')
    })
    tagInput.on('focusout', function (e) {
        tagList.removeClass('active')
        const val = tagInput.val()
        if (val !== '') {
            addTag(val)
            tagInput.val('')
        }
    })
    tagInput.on('keydown', function (e) {
        if (e.which === 32 || (e.which === 188 && !e.shiftKey)) {
            const val = tagInput.val()
            if (val !== '') {
                if (addTag(val)) {
                    tagInput.val('')
                }
            }
            e.preventDefault()
        } else if (e.which === 8) {
            const val = tagInput.val()
            if (val === '') {
                const prevTag = $(this).parent().prev().attr('tag')
                if (prevTag) {
                    removeTag(prevTag)
                }
                e.preventDefault()
            }
        }
    })

    function strip () {
        $('li', tagList).each(function (i, e) {
            const li = $(e)
            if (li.hasClass('tag-input')) {
                li.remove()
            } else {
                const tag = $(li).attr('tag')
                li.html(formatTag(tag))
            }
        })
    }

    function cancel () {
        $('li', tagList).remove()
        tags = originalTags
        for (const i in tags) {
            tagList.append($('<li>').html(formatTag(tags[i])).attr('tag', tags[i]))
        }
    }
    function addTag (tag) {
        tag = tag.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const i = $.inArray(tag, tags)
        if (i === -1) {
            tags.push(tag)

            const newtag = $('<li>').html(tag + ' <a href="#"><i class="icon icon-remove"></i></a>')
            $(newtag).attr('tag', tag)
            $('a', newtag).click(function (e) {
                removeTag(tag)
                e.preventDefault()
            })
            tagInput.parent().before(newtag)
            return true
        } else {
            const existingTag = $("li[tag='" + tag + "']", tagList)
            existingTag.css({ borderColor: '#f00', background: '#fcc' })
            window.setTimeout(function () {
                existingTag.css({ borderColor: '#ccc', background: '#f5f5f5' })
            }, 1000)
            return false
        }
    }
    function removeTag (tag) {
        const i = $.inArray(tag, tags)
        if (i !== -1) {
            tags.splice(i, 1)

            $('li', tagList).each(function (i, e) {
                if ($(e).attr('tag') === tag) {
                    e.remove()
                }
            })
        }
    }
    return {
        add: addTag,
        remove: removeTag,
        get: function () { return tags },
        strip,
        cancel
    }
}
