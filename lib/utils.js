const csrf = require('csurf')
const createDOMPurify = require('dompurify')
const { JSDOM } = require('jsdom')
const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)
const { marked } = require('marked')

function formatDate (dateString) {
    if (!dateString) {
        return ''
    }
    const now = Date.now()
    const d = new Date(dateString)
    let delta = now - d.getTime()

    delta /= 1000

    if (delta < 60) {
        return 'seconds ago'
    }

    delta = Math.floor(delta / 60)

    if (delta < 10) {
        return 'minutes ago'
    }
    if (delta < 60) {
        return delta + ' minutes ago'
    }

    delta = Math.floor(delta / 60)

    if (delta < 24) {
        return delta + ' hour' + (delta > 1 ? 's' : '') + ' ago'
    }

    delta = Math.floor(delta / 24)

    if (delta < 7) {
        return delta + ' day' + (delta > 1 ? 's' : '') + ' ago'
    }
    let weeks = Math.floor(delta / 7)
    const days = delta % 7

    if (weeks < 4) {
        if (days === 0) {
            return weeks + ' week' + (weeks > 1 ? 's' : '') + ' ago'
        } else {
            return weeks + ' week' + (weeks > 1 ? 's' : '') + ', ' + days + ' day' + (days > 1 ? 's' : '') + ' ago'
        }
    }

    let months = Math.floor(weeks / 4)
    weeks = weeks % 4

    if (months < 12) {
        if (weeks === 0) {
            return months + ' month' + (months > 1 ? 's' : '') + ' ago'
        } else {
            return months + ' month' + (months > 1 ? 's' : '') + ', ' + weeks + ' week' + (weeks > 1 ? 's' : '') + ' ago'
        }
    }

    const years = Math.floor(months / 12)
    months = months % 12

    if (months === 0) {
        return years + ' year' + (years > 1 ? 's' : '') + ' ago'
    } else {
        return years + ' year' + (years > 1 ? 's' : '') + ', ' + months + ' month' + (months > 1 ? 's' : '') + ' ago'
    }
}

function formatShortDate (d) {
    let delta = Date.now() - (new Date(d)).getTime()
    delta /= 1000
    const days = Math.floor(delta / (60 * 60 * 24))
    const weeks = Math.floor(days / 7)
    let months = Math.floor(weeks / 4)
    const years = Math.floor(months / 12)
    if (days < 7) {
        return days + 'd'
    } else if (weeks < 4) {
        return weeks + 'w'
    } else if (months < 12) {
        return months + 'm'
    } else {
        months = months % 12
        if (months > 0) {
            return years + 'y ' + months + 'm'
        }
        return years + 'y'
    }
}

const csrfProtection = csrf({ cookie: true })

async function renderMarkdown (src, opt) {
    const content = await marked.parse(src, { async: true, ...opt })
    return DOMPurify.sanitize(content)
}

/**
 * Middleware that validates the user has a given role
 * @param {String} role one of user/mod/admin
 */
function requireRole (role) {
    return (req, res, next) => {
        if (req.session.user) {
            if (!role || role === 'user') {
                // Logged in user
                next()
                return
            }
            if (role === 'admin' && req.session.user.isAdmin) {
                next()
                return
            }
            if (role === 'mod' && (req.session.user.isAdmin || req.session.user.isModerator)) {
                next()
                return
            }
        }
        console.log('rejecting request', role, req.session.user)
        res.status(404).send()
    }
}

function generateSummary (desc) {
    let summary = (desc || '').split('\n')[0]
    const re = /\[(.*?)\]\(.*?\)/g
    let m
    while ((m = re.exec(summary)) !== null) {
        summary = summary.substring(0, m.index) + m[1] + summary.substring(m.index + m[0].length)
    }

    if (summary.length > 150) {
        summary = summary.substring(0, 150).split('\n')[0] + '...'
    }
    return summary
}

module.exports = {
    generateSummary,
    renderMarkdown,
    formatDate,
    formatShortDate,
    csrfProtection: () => csrfProtection,
    requireRole
}
