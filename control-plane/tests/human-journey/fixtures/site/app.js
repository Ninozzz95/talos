const body = document.body
const dialog = document.querySelector('#cookie-dialog')
const opener = document.querySelector('#cookie-opener')
const accept = document.querySelector('#cookie-accept')
const cookieStatus = document.querySelector('#cookie-status')
const mutationStatus = document.querySelector('[data-testid="background-mutation"]')
const staleStatus = document.querySelector('[data-testid="stale-status"]')
const fileInput = document.querySelector('#synthetic-file')
const uploadStatus = document.querySelector('[data-testid="upload-status"]')

let returnFocus = opener

function openCookieDialog(trigger = opener) {
    if (dialog.open) return
    returnFocus = trigger
    dialog.showModal()
    queueMicrotask(() => accept.focus())
}

opener.addEventListener('click', () => openCookieDialog(opener))

dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dialog.close('cancelled')
})

dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'accepted') {
        body.dataset.cookieState = 'accepted'
        cookieStatus.textContent = 'Cookie preferences accepted'
    }
    queueMicrotask(() => returnFocus?.focus())
})

function bindStaleTarget(target) {
    target.addEventListener('click', () => {
        const generation = Number(target.dataset.generation ?? '1') + 1
        const replacement = document.createElement('button')
        replacement.id = 'stale-target'
        replacement.type = 'button'
        replacement.dataset.generation = String(generation)
        replacement.textContent = 'Refresh target'
        target.replaceWith(replacement)
        staleStatus.textContent = `Target generation ${generation}`
        bindStaleTarget(replacement)
    }, { once: true })
}

bindStaleTarget(document.querySelector('#stale-target'))

fileInput.addEventListener('change', () => {
    uploadStatus.textContent = fileInput.files?.[0]?.name
        ? `${fileInput.files[0].name} selected`
        : 'No file selected'
})

setTimeout(() => {
    body.dataset.mutationVersion = '1'
    mutationStatus.textContent = 'Background revision 1'
}, 120)

openCookieDialog(opener)
