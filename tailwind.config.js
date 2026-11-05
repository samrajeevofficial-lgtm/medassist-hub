// Tailwind v3 build config. The compiled file is committed (public/css/tailwind.css),
// so running the app needs no build step. After changing classes, run: npm run build:css
module.exports = {
    content: ['./public/**/*.html', './public/js/**/*.js'],
    theme: {
        extend: {
            colors: {
                primary: '#1e3a8a',
                secondary: '#3b82f6',
                accent: '#eff6ff',
            },
        },
    },
};
