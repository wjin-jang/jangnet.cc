(function () {
    var pres = document.querySelectorAll('.post-content > pre, .page-content > pre');

    pres.forEach(function (pre) {
        var inner = document.createElement('div');
        inner.className = 'code-inner';

        var btn = document.createElement('button');
        btn.className = 'code-copy';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Copy code');
        var ico = document.createElement('img');
        ico.src = '/assets/images/icons/copy.png';
        ico.alt = 'Copy';
        btn.appendChild(ico);
        btn.addEventListener('click', function () {
            navigator.clipboard.writeText(pre.textContent);
            ico.style.opacity = '0';
            setTimeout(function () {
                ico.src = '/assets/images/icons/done.png';
                ico.style.opacity = '1';
            }, 150);
            setTimeout(function () {
                ico.style.opacity = '0';
                setTimeout(function () {
                    ico.src = '/assets/images/icons/copy.png';
                    ico.style.opacity = '1';
                }, 150);
            }, 3000);
        });

        pre.parentNode.insertBefore(inner, pre);
        inner.appendChild(btn);
        inner.appendChild(pre);
    });
})();
