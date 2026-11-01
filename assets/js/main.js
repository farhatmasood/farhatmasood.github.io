(function () {
    // Old single-page links (index.html#publications etc.) -> new pages
    const oldTabs = {
        'about': 'index.html',
        'projects': 'academic/featured.html',
        'publications': 'academic/publications.html',
        'github-repos': 'academic/repositories.html',
        'research-projects': 'academic/research.html',
        'hobbies': 'academic/hobbies.html',
        'service': 'academic/service.html',
        'prof-profile': 'professional/profile.html',
        'prof-trajectory': 'professional/career-path.html',
        'prof-experience': 'professional/experience.html',
        'prof-competencies': 'professional/competencies.html',
        'prof-education': 'professional/education.html'
    };
    const hash = (location.hash || '').replace('#', '');
    if (document.getElementById('about') && oldTabs[hash] && !document.getElementById(hash)) {
        location.replace(oldTabs[hash]);
        return;
    }

    // Mobile menu toggle
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
    }

    // Accordion (competency highlights)
    document.querySelectorAll('.accordion-header').forEach(h => {
        h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
    });
})();
