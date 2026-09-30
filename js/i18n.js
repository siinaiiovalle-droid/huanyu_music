/* 寰宇音乐台 · 多语言词典（zh / en / es / fr / ja / ar） */
(function (global) {
  'use strict';

  const LANGS = [
    { code: 'zh', name: '简体中文', dir: 'ltr' },
    { code: 'en', name: 'English', dir: 'ltr' },
    { code: 'es', name: 'Español', dir: 'ltr' },
    { code: 'fr', name: 'Français', dir: 'ltr' },
    { code: 'ja', name: '日本語', dir: 'ltr' },
    { code: 'ar', name: 'العربية', dir: 'rtl' }
  ];

  const DICT = {
    zh: {
      'nav.home': '首页', 'nav.works': '作品', 'nav.about': '关于', 'nav.admin': '发布作品',
      'hero.tag': '原创 · 人工智能作曲',
      'hero.title': '让世界听见同一种心跳',
      'hero.desc': '这里收藏由寰宇音乐台作曲引擎创作的原创音乐与歌曲。所有音符都由代码实时合成，没有借用任何现成素材。戴上耳机，和世界同频。',
      'hero.play': '立即播放', 'hero.browse': '浏览全部作品',
      'sec.featured': '精选作品', 'sec.all': '全部作品', 'sec.count': '共 {n} 首',
      'kind.instrumental': '纯音乐', 'kind.song': '歌曲',
      'label.plays': '次播放', 'label.likes': '次喜欢', 'label.bpm': '速度', 'label.key': '调性',
      'label.genre': '风格', 'label.released': '发行', 'label.duration': '时长',
      'btn.play': '播放', 'btn.pause': '暂停', 'btn.download': '下载', 'btn.detail': '详情', 'btn.back': '返回首页',
      'player.idle': '还没有播放任何作品',
      'player.shuffle': '随机播放', 'player.loop': '单曲循环', 'player.list': '播放列表', 'player.volume': '音量',
      'player.prev': '上一首', 'player.next': '下一首',
      'track.credits': '创作信息', 'track.lyrics': '歌词', 'track.noLyrics': '这首是纯音乐，没有歌词。',
      'track.related': '更多作品', 'track.spectrum': '实时频谱', 'track.like': '喜欢',
      'track.follow': '回到当前句', 'track.autoFollow': '歌词自动跟随播放进度，当前唱到的字会发光',
      'admin.title': '发布新作品', 'admin.subtitle': '以后有了新的创作，从这里上传，全世界立刻就能听到。',
      'admin.loginTitle': '后台登录', 'admin.password': '后台密码', 'admin.login': '登录', 'admin.logout': '退出',
      'admin.wrongPw': '密码不正确', 'admin.uploadTitle': '上传作品',
      'admin.f.title': '作品名称', 'admin.f.subtitle': '一句话副标题', 'admin.f.desc': '作品简介',
      'admin.f.kind': '类型', 'admin.f.audio': '音频文件（mp3 / wav / ogg / m4a）', 'admin.f.cover': '封面图片（可选，留空自动生成）',
      'admin.f.genre': '风格', 'admin.f.bpm': '速度 BPM', 'admin.f.key': '调性', 'admin.f.featured': '设为精选',
      'admin.submit': '发布', 'admin.uploading': '正在上传…', 'admin.uploaded': '发布成功！刷新首页即可看到。',
      'admin.listTitle': '已发布的作品', 'admin.delete': '删除', 'admin.confirmDel': '确定删除这首作品吗？',
      'admin.tip': '也可以用命令行发布：在項目目录执行 npm run add -- --file 你的音乐.mp3 --title 作品名',
      'about.title': '关于寰宇音乐台',
      'about.p1': '寰宇音乐台是一个面向世界的原创音乐网站。这里的每一首作品，都由自研的作曲引擎实时合成：从振荡器波形、包络、滤波，到鼓组、混响与母带处理，全部由代码生成。',
      'about.p2': '我们相信音乐不需要翻译。《星海序曲》用星尘般的钢琴琶音铺开一幅宇宙画卷；《世界同频》则是一首唱给世界的歌——不同的语言，唱出的是同样的爱。',
      'about.tech': '技术说明',
      'about.techList': '零第三方依赖，仅需 Node.js 18+；音频为 44.1kHz 立体声 MP3；网站原生 HTML/CSS/JS，无构建步骤；曲目数据存放于 JSON 文件，可平滑替换为数据库。',
      'about.future': '以后会持续发布新的音乐与歌曲，敬请期待。',
      'footer.rights': '寰宇音乐台 · 原创音乐', 'footer.note': '本站所有作品均由寰宇音乐台作曲引擎生成，版权归寰宇音乐台所有。',
      'loading': '正在载入作品…', 'empty': '还没有作品，去后台发布第一首吧。'
    },
    en: {
      'nav.home': 'Home', 'nav.works': 'Works', 'nav.about': 'About', 'nav.admin': 'Publish',
      'hero.tag': 'Original · AI-composed',
      'hero.title': 'Let the world hear one heartbeat',
      'hero.desc': 'Original music and songs composed by the Huanyu Music engine. Every note is synthesized from code in real time — no borrowed samples. Put on your headphones and sync with the world.',
      'hero.play': 'Play now', 'hero.browse': 'Browse all works',
      'sec.featured': 'Featured', 'sec.all': 'All works', 'sec.count': '{n} tracks',
      'kind.instrumental': 'Instrumental', 'kind.song': 'Song',
      'label.plays': 'plays', 'label.likes': 'likes', 'label.bpm': 'Tempo', 'label.key': 'Key',
      'label.genre': 'Genre', 'label.released': 'Released', 'label.duration': 'Length',
      'btn.play': 'Play', 'btn.pause': 'Pause', 'btn.download': 'Download', 'btn.detail': 'Details', 'btn.back': 'Back home',
      'player.idle': 'Nothing is playing yet',
      'player.shuffle': 'Shuffle', 'player.loop': 'Repeat', 'player.list': 'Playlist', 'player.volume': 'Volume',
      'player.prev': 'Previous', 'player.next': 'Next',
      'track.credits': 'Credits', 'track.lyrics': 'Lyrics', 'track.noLyrics': 'This is an instrumental piece — no lyrics.',
      'track.related': 'More works', 'track.spectrum': 'Live spectrum', 'track.like': 'Like',
      'track.follow': 'Back to current line', 'track.autoFollow': 'Lyrics follow the music, and the word being sung lights up',
      'admin.title': 'Publish a new work', 'admin.subtitle': 'Whenever a new piece is created, upload it here and the whole world can listen instantly.',
      'admin.loginTitle': 'Sign in', 'admin.password': 'Password', 'admin.login': 'Sign in', 'admin.logout': 'Sign out',
      'admin.wrongPw': 'Wrong password', 'admin.uploadTitle': 'Upload',
      'admin.f.title': 'Title', 'admin.f.subtitle': 'One-line subtitle', 'admin.f.desc': 'Description',
      'admin.f.kind': 'Type', 'admin.f.audio': 'Audio file (mp3 / wav / ogg / m4a)', 'admin.f.cover': 'Cover image (optional — auto-generated if empty)',
      'admin.f.genre': 'Genre', 'admin.f.bpm': 'Tempo BPM', 'admin.f.key': 'Key', 'admin.f.featured': 'Set as featured',
      'admin.submit': 'Publish', 'admin.uploading': 'Uploading…', 'admin.uploaded': 'Published! Refresh the home page to see it.',
      'admin.listTitle': 'Published works', 'admin.delete': 'Delete', 'admin.confirmDel': 'Delete this work?',
      'admin.tip': 'Command line alternative: npm run add -- --file your-music.mp3 --title "Title"',
      'about.title': 'About Huanyu Music',
      'about.p1': 'Huanyu Music is an original music site for the whole world. Every piece is synthesized in real time by our own composition engine: oscillator waveforms, envelopes, filters, drums, reverb and mastering — all generated by code.',
      'about.p2': 'We believe music needs no translation. "Starfield Overture" paints a cosmic picture with stardust piano arpeggios; "World in Sync" is a song for the world — different languages, the same love.',
      'about.tech': 'Technical notes',
      'about.techList': 'Zero third-party dependencies, Node.js 18+ only; audio is 44.1 kHz stereo MP3; the site is native HTML/CSS/JS with no build step; track data lives in JSON files and can be migrated to a database.',
      'about.future': 'New music and songs will keep coming. Stay tuned.',
      'footer.rights': 'Huanyu Music · Original', 'footer.note': 'All works on this site are generated by the Huanyu Music engine. All rights reserved.',
      'loading': 'Loading works…', 'empty': 'No works yet — publish the first one from the admin page.'
    },
    es: {
      'nav.home': 'Inicio', 'nav.works': 'Obras', 'nav.about': 'Acerca de', 'nav.admin': 'Publicar',
      'hero.tag': 'Original · Compuesto por IA',
      'hero.title': 'Que el mundo escuche un mismo latido',
      'hero.desc': 'Música y canciones originales creadas por el motor de composición de Huanyu Music. Cada nota se sintetiza con código en tiempo real, sin muestras prestadas. Pon tus auriculares y sincroniza con el mundo.',
      'hero.play': 'Escuchar ahora', 'hero.browse': 'Ver todas las obras',
      'sec.featured': 'Destacada', 'sec.all': 'Todas las obras', 'sec.count': '{n} pistas',
      'kind.instrumental': 'Instrumental', 'kind.song': 'Canción',
      'label.plays': 'reproducciones', 'label.likes': 'me gusta', 'label.bpm': 'Tempo', 'label.key': 'Tonalidad',
      'label.genre': 'Género', 'label.released': 'Publicado', 'label.duration': 'Duración',
      'btn.play': 'Reproducir', 'btn.pause': 'Pausar', 'btn.download': 'Descargar', 'btn.detail': 'Detalles', 'btn.back': 'Volver al inicio',
      'player.idle': 'Aún no suena nada',
      'player.shuffle': 'Aleatorio', 'player.loop': 'Repetir', 'player.list': 'Lista', 'player.volume': 'Volumen',
      'player.prev': 'Anterior', 'player.next': 'Siguiente',
      'track.credits': 'Créditos', 'track.lyrics': 'Letra', 'track.noLyrics': 'Es una pieza instrumental, sin letra.',
      'track.related': 'Más obras', 'track.spectrum': 'Espectro en vivo', 'track.like': 'Me gusta',
      'track.follow': 'Volver al verso actual', 'track.autoFollow': 'La letra sigue la música y la palabra cantada se ilumina',
      'admin.title': 'Publicar una nueva obra', 'admin.subtitle': 'Cuando crees algo nuevo, súbelo aquí y todo el mundo podrá escucharlo al instante.',
      'admin.loginTitle': 'Acceso', 'admin.password': 'Contraseña', 'admin.login': 'Entrar', 'admin.logout': 'Salir',
      'admin.wrongPw': 'Contraseña incorrecta', 'admin.uploadTitle': 'Subir obra',
      'admin.f.title': 'Título', 'admin.f.subtitle': 'Subtítulo breve', 'admin.f.desc': 'Descripción',
      'admin.f.kind': 'Tipo', 'admin.f.audio': 'Archivo de audio (mp3 / wav / ogg / m4a)', 'admin.f.cover': 'Portada (opcional; se genera sola si se deja vacío)',
      'admin.f.genre': 'Género', 'admin.f.bpm': 'Tempo BPM', 'admin.f.key': 'Tonalidad', 'admin.f.featured': 'Marcar como destacada',
      'admin.submit': 'Publicar', 'admin.uploading': 'Subiendo…', 'admin.uploaded': '¡Publicado! Actualiza la portada para verlo.',
      'admin.listTitle': 'Obras publicadas', 'admin.delete': 'Eliminar', 'admin.confirmDel': '¿Eliminar esta obra?',
      'admin.tip': 'También por línea de comandos: npm run add -- --file tu-musica.mp3 --title "Título"',
      'about.title': 'Acerca de Huanyu Music',
      'about.p1': 'Huanyu Music es un sitio de música original para todo el mundo. Cada obra se sintetiza en tiempo real con nuestro propio motor: formas de onda, envolventes, filtros, batería, reverberación y masterización, todo generado por código.',
      'about.p2': 'Creemos que la música no necesita traducción. «Obertura del Campo de Estrellas» pinta un cosmos con arpegios de piano; «El mundo en sintonía» es una canción para el mundo: idiomas distintos, el mismo amor.',
      'about.tech': 'Notas técnicas',
      'about.techList': 'Sin dependencias externas, solo Node.js 18+; audio MP3 estéreo a 44,1 kHz; sitio en HTML/CSS/JS nativo sin compilación; los datos están en JSON y pueden migrarse a una base de datos.',
      'about.future': 'Seguiremos publicando nueva música. ¡Gracias por escuchar!',
      'footer.rights': 'Huanyu Music · Original', 'footer.note': 'Todas las obras son generadas por el motor de Huanyu Music. Todos los derechos reservados.',
      'loading': 'Cargando obras…', 'empty': 'Aún no hay obras: publica la primera desde el panel.'
    },
    fr: {
      'nav.home': 'Accueil', 'nav.works': 'Œuvres', 'nav.about': 'À propos', 'nav.admin': 'Publier',
      'hero.tag': 'Original · Composé par IA',
      'hero.title': 'Que le monde entende un seul battement',
      'hero.desc': 'Musiques et chansons originales composées par le moteur Huanyu Music. Chaque note est synthétisée par le code en temps réel, sans aucun échantillon emprunté. Mettez vos écouteurs et synchronisez-vous avec le monde.',
      'hero.play': 'Écouter', 'hero.browse': 'Voir toutes les œuvres',
      'sec.featured': 'À la une', 'sec.all': 'Toutes les œuvres', 'sec.count': '{n} titres',
      'kind.instrumental': 'Instrumental', 'kind.song': 'Chanson',
      'label.plays': 'écoutes', 'label.likes': 'j’aime', 'label.bpm': 'Tempo', 'label.key': 'Tonalité',
      'label.genre': 'Genre', 'label.released': 'Publié', 'label.duration': 'Durée',
      'btn.play': 'Lecture', 'btn.pause': 'Pause', 'btn.download': 'Télécharger', 'btn.detail': 'Détails', 'btn.back': 'Retour à l’accueil',
      'player.idle': 'Rien ne joue pour l’instant',
      'player.shuffle': 'Aléatoire', 'player.loop': 'Répéter', 'player.list': 'File d’attente', 'player.volume': 'Volume',
      'player.prev': 'Précédent', 'player.next': 'Suivant',
      'track.credits': 'Crédits', 'track.lyrics': 'Paroles', 'track.noLyrics': 'Pièce instrumentale : aucune parole.',
      'track.related': 'Autres œuvres', 'track.spectrum': 'Spectre en direct', 'track.like': 'J’aime',
      'track.follow': 'Revenir au vers actuel', 'track.autoFollow': 'Les paroles suivent la musique et le mot chanté s’illumine',
      'admin.title': 'Publier une nouvelle œuvre', 'admin.subtitle': 'Dès qu’une nouvelle création est prête, déposez-la ici : le monde entier l’entendra aussitôt.',
      'admin.loginTitle': 'Connexion', 'admin.password': 'Mot de passe', 'admin.login': 'Se connecter', 'admin.logout': 'Déconnexion',
      'admin.wrongPw': 'Mot de passe incorrect', 'admin.uploadTitle': 'Téléverser',
      'admin.f.title': 'Titre', 'admin.f.subtitle': 'Sous-titre', 'admin.f.desc': 'Description',
      'admin.f.kind': 'Type', 'admin.f.audio': 'Fichier audio (mp3 / wav / ogg / m4a)', 'admin.f.cover': 'Pochette (facultatif, générée automatiquement si vide)',
      'admin.f.genre': 'Genre', 'admin.f.bpm': 'Tempo BPM', 'admin.f.key': 'Tonalité', 'admin.f.featured': 'Mettre en vedette',
      'admin.submit': 'Publier', 'admin.uploading': 'Envoi…', 'admin.uploaded': 'Publié ! Actualisez l’accueil pour le voir.',
      'admin.listTitle': 'Œuvres publiées', 'admin.delete': 'Supprimer', 'admin.confirmDel': 'Supprimer cette œuvre ?',
      'admin.tip': 'Ligne de commande : npm run add -- --file votre-musique.mp3 --title "Titre"',
      'about.title': 'À propos de Huanyu Music',
      'about.p1': 'Huanyu Music est un site de musique originale destiné au monde entier. Chaque œuvre est synthétisée en temps réel par notre propre moteur : formes d’onde, enveloppes, filtres, batterie, réverbe et mastérisation, tout est généré par le code.',
      'about.p2': 'Nous pensons que la musique n’a pas besoin de traduction. « Ouverture du Champ d’Étoiles » peint un cosmos d’arpèges de piano ; « Le monde en harmonie » est une chanson pour le monde : des langues différentes, le même amour.',
      'about.tech': 'Notes techniques',
      'about.techList': 'Aucune dépendance externe, Node.js 18+ seulement ; audio MP3 stéréo 44,1 kHz ; site en HTML/CSS/JS natif sans étape de build ; données en JSON, migrables vers une base de données.',
      'about.future': 'De nouvelles œuvres arriveront régulièrement. Merci de votre écoute.',
      'footer.rights': 'Huanyu Music · Original', 'footer.note': 'Toutes les œuvres sont générées par le moteur Huanyu Music. Tous droits réservés.',
      'loading': 'Chargement…', 'empty': 'Aucune œuvre : publiez la première depuis le panneau.'
    },
    ja: {
      'nav.home': 'ホーム', 'nav.works': '作品', 'nav.about': 'について', 'nav.admin': '作品を投稿',
      'hero.tag': 'オリジナル · AI 作曲',
      'hero.title': '世界に同じ鼓動を届けよう',
      'hero.desc': 'ここは寰宇音楽台の作曲エンジンが生み出したオリジナル音楽のサイトです。すべての音はコードからリアルタイムに合成され、既製の素材は一切使っていません。ヘッドホンを着けて、世界と同じリズムで。',
      'hero.play': '今すぐ再生', 'hero.browse': 'すべての作品',
      'sec.featured': '注目作品', 'sec.all': 'すべての作品', 'sec.count': '全 {n} 曲',
      'kind.instrumental': 'インストゥルメンタル', 'kind.song': '歌曲',
      'label.plays': '再生', 'label.likes': 'いいね', 'label.bpm': 'テンポ', 'label.key': '調',
      'label.genre': 'ジャンル', 'label.released': '公開日', 'label.duration': '長さ',
      'btn.play': '再生', 'btn.pause': '一時停止', 'btn.download': 'ダウンロード', 'btn.detail': '詳細', 'btn.back': 'ホームへ戻る',
      'player.idle': 'まだ再生していません',
      'player.shuffle': 'シャッフル', 'player.loop': 'リピート', 'player.list': 'プレイリスト', 'player.volume': '音量',
      'player.prev': '前の曲', 'player.next': '次の曲',
      'track.credits': 'クレジット', 'track.lyrics': '歌詞', 'track.noLyrics': 'インストゥルメンタル曲のため歌詞はありません。',
      'track.related': '他の作品', 'track.spectrum': 'リアルタイム波形', 'track.like': 'いいね',
      'track.follow': '現在の行へ戻る', 'track.autoFollow': '歌詞は再生に合わせて自動スクロールし、歌っている文字が光ります',
      'admin.title': '新しい作品を投稿', 'admin.subtitle': '新しい曲ができたらここからアップロード。世界中の人がすぐに聴けます。',
      'admin.loginTitle': 'ログイン', 'admin.password': 'パスワード', 'admin.login': 'ログイン', 'admin.logout': 'ログアウト',
      'admin.wrongPw': 'パスワードが違います', 'admin.uploadTitle': 'アップロード',
      'admin.f.title': 'タイトル', 'admin.f.subtitle': 'サブタイトル', 'admin.f.desc': '紹介文',
      'admin.f.kind': '種類', 'admin.f.audio': '音声ファイル（mp3 / wav / ogg / m4a）', 'admin.f.cover': 'ジャケット画像（省略可・自動生成）',
      'admin.f.genre': 'ジャンル', 'admin.f.bpm': 'テンポ BPM', 'admin.f.key': '調', 'admin.f.featured': '注目作品にする',
      'admin.submit': '投稿', 'admin.uploading': 'アップロード中…', 'admin.uploaded': '投稿しました！ホームを更新してください。',
      'admin.listTitle': '投稿済みの作品', 'admin.delete': '削除', 'admin.confirmDel': 'この作品を削除しますか？',
      'admin.tip': 'コマンドラインでも投稿できます：npm run add -- --file 音楽.mp3 --title タイトル',
      'about.title': '寰宇音楽台について',
      'about.p1': '寰宇音楽台は世界に向けたオリジナル音楽サイトです。波形、エンベロープ、フィルタ、ドラム、リバーブ、マスタリングまで、すべて自作エンジンのコードがリアルタイムに合成しています。',
      'about.p2': '音楽に翻訳は要りません。『星原序曲』は星屑のようなピアノのアルペジオで宇宙を描き、『世界は同じ鼓動』は世界へ贈る歌——ことばは違っても、愛は同じです。',
      'about.tech': '技術情報',
      'about.techList': '外部依存ゼロ、Node.js 18+ のみ。音声は 44.1kHz ステレオ MP3。サイトはビルド不要なネイティブ HTML/CSS/JS。曲データは JSON で、データベースへ移行も容易です。',
      'about.future': '新しい音楽と歌をこれからも公開していきます。',
      'footer.rights': '寰宇音楽台 · オリジナル', 'footer.note': '掲載作品はすべて寰宇音楽台の作曲エンジンによる生成物です。無断使用を禁じます。',
      'loading': '読み込み中…', 'empty': '作品がまだありません。管理画面から最初の1曲を投稿してください。'
    },
    ar: {
      'nav.home': 'الرئيسية', 'nav.works': 'الأعمال', 'nav.about': 'حول', 'nav.admin': 'نشر عمل',
      'hero.tag': 'أصلي · بتلحين آلي',
      'hero.title': 'لِيَسْمَعِ العالمُ نبضةً واحدة',
      'hero.desc': 'موسيقى وأغانٍ أصلية من محرّك التأليف في Huanyu Music. كل نغمة تُصنَّع بالكود في الزمن الحقيقي دون أي عيّنات جاهزة. ضع سماعتك وتناغم مع العالم.',
      'hero.play': 'استمع الآن', 'hero.browse': 'تصفّح كل الأعمال',
      'sec.featured': 'عمل مميّز', 'sec.all': 'كل الأعمال', 'sec.count': '{n} مقطع',
      'kind.instrumental': 'موسيقى آلات', 'kind.song': 'أغنية',
      'label.plays': 'تشغيل', 'label.likes': 'إعجاب', 'label.bpm': 'الإيقاع', 'label.key': 'المقام',
      'label.genre': 'النوع', 'label.released': 'تاريخ النشر', 'label.duration': 'المدة',
      'btn.play': 'تشغيل', 'btn.pause': 'إيقاف', 'btn.download': 'تنزيل', 'btn.detail': 'التفاصيل', 'btn.back': 'العودة للرئيسية',
      'player.idle': 'لا شيء يعمل الآن',
      'player.shuffle': 'عشوائي', 'player.loop': 'تكرار', 'player.list': 'قائمة التشغيل', 'player.volume': 'الصوت',
      'player.prev': 'السابق', 'player.next': 'التالي',
      'track.credits': 'حقوق العمل', 'track.lyrics': 'الكلمات', 'track.noLyrics': 'هذه مقطوعة آلات، بلا كلمات.',
      'track.related': 'أعمال أخرى', 'track.spectrum': 'الطيف الحي', 'track.like': 'أعجبني',
      'track.follow': 'العودة إلى السطر الحالي', 'track.autoFollow': 'تتبع الكلمات تقدّم التشغيل ويتوهج الحرف المغنّى الآن',
      'admin.title': 'نشر عمل جديد', 'admin.subtitle': 'كلما أبدعت عملاً جديداً، ارفعه هنا ليسمعه العالم فوراً.',
      'admin.loginTitle': 'تسجيل الدخول', 'admin.password': 'كلمة المرور', 'admin.login': 'دخول', 'admin.logout': 'خروج',
      'admin.wrongPw': 'كلمة المرور غير صحيحة', 'admin.uploadTitle': 'رفع العمل',
      'admin.f.title': 'العنوان', 'admin.f.subtitle': 'عنوان فرعي', 'admin.f.desc': 'الوصف',
      'admin.f.kind': 'النوع', 'admin.f.audio': 'ملف صوتي (mp3 / wav / ogg / m4a)', 'admin.f.cover': 'صورة الغلاف (اختياري — تُولَّد تلقائياً)',
      'admin.f.genre': 'النوع', 'admin.f.bpm': 'الإيقاع BPM', 'admin.f.key': 'المقام', 'admin.f.featured': 'تمييزه كعمل رئيسي',
      'admin.submit': 'نشر', 'admin.uploading': 'جارٍ الرفع…', 'admin.uploaded': 'تم النشر! حدّث الصفحة الرئيسية لتراه.',
      'admin.listTitle': 'الأعمال المنشورة', 'admin.delete': 'حذف', 'admin.confirmDel': 'حذف هذا العمل؟',
      'admin.tip': 'يمكنك أيضاً النشر بالأمر: npm run add -- --file music.mp3 --title "العنوان"',
      'about.title': 'حول Huanyu Music',
      'about.p1': 'Huanyu Music موقع موسيقى أصليّة موجّه للعالم كله. كل عمل يُصنَّع لحظياً بمحرّكنا الخاص: الموجات، الأغلفة، المرشّحات، الطبول، الصدى والماسترينغ، كلها بالكود.',
      'about.p2': 'نؤمن أن الموسيقى لا تحتاج ترجمة. «افتتاحية حقل النجوم» ترسم كوناً من أربيجات البيانو، و«العالم على نفس الإيقاع» أغنية للعالم: لغات مختلفة، والحب نفسه.',
      'about.tech': 'ملاحظات تقنية',
      'about.techList': 'بلا أي اعتماد خارجي، يكفي Node.js 18+؛ الصوت MP3 ستيريو 44.1 kHz؛ الموقع بـ HTML/CSS/JS أصلي دون بناء؛ بيانات الأعمال في JSON ويمكن نقلها لقاعدة بيانات.',
      'about.future': 'سنواصل نشر موسيقى وأغانٍ جديدة. شكراً لاستماعكم.',
      'footer.rights': 'Huanyu Music · أعمال أصلية', 'footer.note': 'جميع الأعمال من إنتاج محرّك Huanyu Music. جميع الحقوق محفوظة.',
      'loading': 'جارٍ التحميل…', 'empty': 'لا توجد أعمال بعد — انشر أول عمل من لوحة الإدارة.'
    }
  };

  let current = localStorage.getItem('huanyu-lang') || 'zh';
  if (!DICT[current]) current = 'zh';

  function t(key, vars) {
    const table = DICT[current] || DICT.zh;
    let s = table[key] != null ? table[key] : (DICT.en[key] != null ? DICT.en[key] : key);
    if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  function meta(lang) { return LANGS.find((l) => l.code === lang) || LANGS[0]; }

  /** 只刷新 DOM 文案，不派发事件（供渲染函数安全调用） */
  function translateDom() {
    const m = meta(current);
    document.documentElement.lang = current;
    document.documentElement.dir = m.dir;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.getAttribute('data-i18n-title')); });
  }

  function apply() {
    translateDom();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: current } }));
  }

  function set(lang) {
    if (!DICT[lang]) return;
    current = lang;
    try { localStorage.setItem('huanyu-lang', lang); } catch (e) { /* ignore */ }
    apply();
  }

  function get() { return current; }

  global.I18N = { LANGS, DICT, t, set, get, apply, translateDom, meta };
})(window);
