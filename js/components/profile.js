/* Profile: name, photo, title, about, location, links, interests. Stored in LocalStorage. */
(function () {
  'use strict';
  const WS = (window.WS = window.WS || {});
  const esc = (s) => WS.util.esc(s);
  const icon = (n, s) => WS.icon(n, s);
  WS.views = WS.views || {};

  function normUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    return /^https?:\/\//i.test(v) ? v : 'https://' + v.replace(/^\/+/, '');
  }
  function githubUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (/github\.com/i.test(v)) return normUrl(v);
    return 'https://github.com/' + v.replace(/^@/, '');
  }
  function linkedinUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (/linkedin\.com/i.test(v)) return normUrl(v);
    return 'https://www.linkedin.com/in/' + v.replace(/^@/, '');
  }

  function avatarInner(photo, name) {
    return photo ? '<img src="' + esc(photo) + '" alt="">' : esc(WS.util.initials(name));
  }

  WS.views.profile = function () {
    WS.app.setTitle('Profile');
    const saved = WS.storage.getProfile();
    let photo = saved.photo || '';

    const field = (id, label, control, hint) =>
      '<div class="form-row"><label for="' + id + '">' + label + '</label><div>' + control + '</div>' + (hint ? '<div class="form-hint">' + hint + '</div>' : '') + '</div>';

    const main = WS.app.render(
      '<div class="view">' +
        '<form id="profile-form" novalidate>' +
          '<div class="view-head">' +
            '<a class="icon-btn" href="#/home" aria-label="Back to home">' + icon('arrowLeft', 20) + '</a>' +
            '<div class="grow"><h1>Edit profile</h1></div>' +
            '<div class="view-actions"><button class="btn btn-primary" type="submit">Save</button></div>' +
          '</div>' +
          '<div class="profile-layout">' +
            '<div class="card" style="padding:22px">' +
              '<div class="avatar-row">' +
                '<div class="avatar xl" id="avatar-preview"></div>' +
                '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">' +
                  '<button class="btn btn-sm" type="button" id="photo-btn">' + icon('camera', 16) + 'Change photo</button>' +
                  '<button class="btn btn-sm btn-ghost" type="button" id="photo-remove">Remove photo</button>' +
                '</div>' +
              '</div>' +
              field('p-name', 'Name', '<input class="input" id="p-name" autocomplete="name">') +
              field('p-title', 'Title', '<input class="input" id="p-title" autocomplete="organization-title">') +
              field('p-about', 'About me', '<textarea class="textarea" id="p-about" rows="4"></textarea>') +
              field('p-location', 'Location', '<input class="input" id="p-location">') +
              field('p-website', 'Website', '<input class="input" id="p-website" inputmode="url" placeholder="example.com">') +
              field('p-github', 'GitHub', '<input class="input" id="p-github" placeholder="username or URL">') +
              field('p-linkedin', 'LinkedIn', '<input class="input" id="p-linkedin" placeholder="username or URL">') +
              field('p-interests', 'Skills & interests', '<div id="p-interests"></div>', 'Press Enter or comma after each item.') +
            '</div>' +
            '<aside class="card profile-card" aria-label="Profile preview"></aside>' +
          '</div>' +
        '</form>' +
      '</div>');

    const $ = (id) => main.querySelector('#' + id);
    $('p-name').value = saved.name;
    $('p-title').value = saved.title;
    $('p-about').value = saved.about;
    $('p-location').value = saved.location;
    $('p-website').value = saved.website;
    $('p-github').value = saved.github;
    $('p-linkedin').value = saved.linkedin;
    const interests = WS.ui.tagsInput($('p-interests'), {
      tags: saved.interests, placeholder: 'Add skill or interest', label: 'Add skill or interest', onChange: paintCard
    });

    function values() {
      return {
        name: $('p-name').value.trim(), title: $('p-title').value.trim(), about: $('p-about').value.trim(),
        location: $('p-location').value.trim(), website: $('p-website').value.trim(),
        github: $('p-github').value.trim(), linkedin: $('p-linkedin').value.trim(),
        interests: interests.getTags(), photo
      };
    }

    function paintCard() {
      const v = { name: $('p-name').value.trim(), title: $('p-title').value.trim(), about: $('p-about').value.trim(),
        location: $('p-location').value.trim(), website: $('p-website').value, github: $('p-github').value, linkedin: $('p-linkedin').value,
        interests: interests ? interests.getTags() : saved.interests };
      const links = [
        [normUrl(v.website), 'Website', 'globe'], [githubUrl(v.github), 'GitHub', 'link'], [linkedinUrl(v.linkedin), 'LinkedIn', 'link']
      ].filter((l) => l[0]);
      $('avatar-preview').innerHTML = avatarInner(photo, v.name);
      main.querySelector('.profile-card').innerHTML =
        '<div class="avatar xl">' + avatarInner(photo, v.name) + '</div>' +
        '<h2>' + esc(v.name || 'Your name') + '</h2>' +
        (v.title ? '<div class="role">' + esc(v.title) + '</div>' : '') +
        (v.location ? '<div class="role" style="display:flex;gap:6px;justify-content:center;align-items:center;margin-top:2px">' + icon('pin', 14) + esc(v.location) + '</div>' : '') +
        (v.about ? '<p class="about">' + esc(v.about) + '</p>' : '') +
        (links.length ? '<div class="profile-links">' + links.map((l) =>
          '<a class="btn btn-sm" href="' + esc(l[0]) + '" target="_blank" rel="noopener noreferrer">' + icon(l[2], 14) + l[1] + '</a>').join('') + '</div>' : '') +
        (v.interests.length ? '<div class="profile-tags">' + v.interests.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' : '');
    }

    main.querySelector('#profile-form').addEventListener('input', paintCard);
    paintCard();

    $('photo-btn').addEventListener('click', () => {
      WS.util.pickFiles('image/*').then((files) => {
        if (!files.length) return;
        WS.util.imageToAvatar(files[0], 256).then((data) => { photo = data; paintCard(); })
          .catch((err) => WS.ui.toast(err.message, 'error'));
      });
    });
    $('photo-remove').addEventListener('click', () => { photo = ''; paintCard(); });

    main.querySelector('#profile-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (WS.storage.saveProfile(values())) WS.ui.toast('Profile saved');
    });
  };
})();
