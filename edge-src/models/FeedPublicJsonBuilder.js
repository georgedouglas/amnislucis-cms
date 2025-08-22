import {
  urlJoinWithRelative,
  buildAudioUrlWithTracking,
  PUBLIC_URLS,
  secondsToHHMMSS,
  htmlToPlainText
} from "../../common-src/StringUtils";
import {humanizeMs, msToRFC3339} from "../../common-src/TimeUtils";
import {ENCLOSURE_CATEGORIES, ITEM_STATUSES_DICT, STATUSES} from "../../common-src/Constants";
import {isValidMediaFile} from "../../common-src/MediaFileUtils";

const {MICROFEED_VERSION} = require('../../common-src/Version');

export default class FeedPublicJsonBuilder {
  constructor(content, baseUrl, request, forOneItem = false) {
    this.content = content;
    this.settings = content.settings || {};
    this.webGlobalSettings = this.settings.webGlobalSettings || {};
    this.publicBucketUrl = this.webGlobalSettings.publicBucketUrl || '';
    this.baseUrl = baseUrl;
    this.forOneItem = forOneItem;
    this.request = request;
  }

  _decorateForItem(item, baseUrl) {
    item.webUrl = PUBLIC_URLS.webItem(item.id, item.title, baseUrl);
    item.jsonUrl = PUBLIC_URLS.jsonItem(item.id, null, baseUrl);
    item.rssUrl = PUBLIC_URLS.rssItem(item.id, null, baseUrl);

    // Try our best to use local time of a website visitor
    const timezone = this.request.cf ? this.request.cf.timezone : null;
    item.pubDate = humanizeMs(item.pubDateMs, timezone);
    item.pubDateRfc3339 = msToRFC3339(item.pubDateMs);
    item.descriptionText = htmlToPlainText(item.description);

    if (item.image) {
      item.image = urlJoinWithRelative(this.publicBucketUrl, item.image);
    }
    if (isValidMediaFile(item.mediaFile)) {
      item.mediaFile.isAudio = item.mediaFile.category === ENCLOSURE_CATEGORIES.AUDIO;
      item.mediaFile.isDocument = item.mediaFile.category === ENCLOSURE_CATEGORIES.DOCUMENT;
      item.mediaFile.isExternalUrl = item.mediaFile.category === ENCLOSURE_CATEGORIES.EXTERNAL_URL;
      item.mediaFile.isVideo = item.mediaFile.category === ENCLOSURE_CATEGORIES.VIDEO;
      item.mediaFile.isImage = item.mediaFile.category === ENCLOSURE_CATEGORIES.IMAGE;

      if (!item.mediaFile.isExternalUrl) {
        item.mediaFile.url = urlJoinWithRelative(this.publicBucketUrl, item.mediaFile.url);
      }
    }
  }

  _buildPublicContentChannel() {
    const channel = this.content.channel || {};
    const publicContent = {};
    publicContent['title'] = channel.title || 'untitled';

    if (channel.link) {
      publicContent['home_page_url'] = channel.link;
    }

    publicContent['feed_url'] = PUBLIC_URLS.jsonFeed(this.baseUrl);

    if (this.content.items_next_cursor && !this.forOneItem) {
      publicContent['next_url'] = `${publicContent['feed_url']}?next_cursor=${this.content.items_next_cursor}&` +
        `sort=${this.content.items_sort_order}`;
    }

    publicContent['description'] = channel.description || '';

    if (channel.image) {
      publicContent['icon'] = urlJoinWithRelative(this.publicBucketUrl, channel.image, this.baseUrl);
    }

    if (this.webGlobalSettings.favicon && this.webGlobalSettings.favicon.url) {
        publicContent['favicon'] = urlJoinWithRelative(
          this.publicBucketUrl, this.webGlobalSettings.favicon.url, this.baseUrl);
    }

    if (channel.publisher) {
      publicContent['authors'] = [{
        'name': channel.publisher,
      }];
    }

    if (channel.language) {
      publicContent['language'] = channel.language;
    }

    if (channel['itunes:complete']) {
      publicContent['expired'] = true;
    }
    return publicContent;
  }

  _buildPublicContentMicrofeedExtra(publicContent) {
    const channel = this.content.channel || {};
    const subscribeMethods = this.settings.subscribeMethods || {'methods': []};
    const microfeedExtra = {
      microfeed_version: MICROFEED_VERSION,
      base_url: this.baseUrl,
      categories: [],
    };
    const channelCategories = channel.categories || [];
    channelCategories.forEach((c) => {
      const topAndSubCats = c.split('/');
      let cat;
      if (topAndSubCats) {
        if (topAndSubCats.length > 0) {
          cat = {
            'name': topAndSubCats[0].trim(),
          };
        }
        if (topAndSubCats.length > 1) {
          cat['categories'] = [{
            'name': topAndSubCats[1].trim(),
          }]
        }
      }
      if (cat) {
        microfeedExtra['categories'].push(cat);
      }
    });
    if (!subscribeMethods.methods) {
      microfeedExtra['subscribe_methods'] = '';
    } else {
      microfeedExtra['subscribe_methods'] = subscribeMethods.methods.filter((m) => m.enabled).map((m) => {
        // TODO: supports custom icons that are hosted on R2
        m.image = urlJoinWithRelative(this.publicBucketUrl, m.image, this.baseUrl);
        if (!m.editable) {
          switch (m.type) {
            case 'rss':
              m.url = PUBLIC_URLS.rssFeed(this.baseUrl);
              return m;
            case 'json':
              m.url = PUBLIC_URLS.jsonFeed(this.baseUrl);
              return m;
            default:
              return m;
          }
        }
        return m;
      });
    }
    microfeedExtra['description_text'] = htmlToPlainText(channel.description);

    if (channel['itunes:explicit']) {
      microfeedExtra['itunes:explicit'] = true;
    }
    if (channel['itunes:title']) {
      microfeedExtra['itunes:title'] = channel['itunes:title'];
    }
    if (channel['copyright']) {
      microfeedExtra['copyright'] = channel['copyright'];
    }
    if (channel['itunes:title']) {
      microfeedExtra['itunes:title'] = channel['itunes:title'];
    }
    if (channel['itunes:type']) {
      microfeedExtra['itunes:type'] = channel['itunes:type'];
    }
    if (channel['itunes:block']) {
      microfeedExtra['itunes:block'] = channel['itunes:block'];
    }
    if (channel['itunes:complete']) {
      microfeedExtra['itunes:complete'] = channel['itunes:complete'];
    }
    if (channel['itunes:new-feed-url']) {
      microfeedExtra['itunes:new-feed-url'] = channel['itunes:new-feed-url'];
    }
    if (channel['itunes:email']) {
      microfeedExtra['itunes:email'] = channel['itunes:email'];
    }
    microfeedExtra['items_sort_order'] = this.content.items_sort_order;
    if (this.content.items_next_cursor && !this.forOneItem) {
      microfeedExtra['items_next_cursor'] = this.content.items_next_cursor;
      microfeedExtra['next_url'] = publicContent['next_url'];
    }
    if (this.content.items_prev_cursor && !this.forOneItem) {
      microfeedExtra['items_prev_cursor'] = this.content.items_prev_cursor;
      microfeedExtra['prev_url'] = `${publicContent['feed_url']}?prev_cursor=${this.content.items_prev_cursor}&` +
        `sort=${this.content.items_sort_order}`;
    }
    return microfeedExtra;
  }

  _buildPublicContentItem(item, mediaFile) {
    let trackingUrls = [];
    if (this.settings.analytics && this.settings.analytics.urls) {
      trackingUrls = this.settings.analytics.urls || [];
    }

    const newItem = {
      id: item.id,
      title: item.title || 'untitled',
    };
    // --- ADICIONE ESTA PARTE ---
    const slugify = (text) => text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '').replace(/-+$/, '');
    
    _microfeed.slug = slugify(item.title);
    // --- FIM DA ADIÇÃO ---
    const attachment = {};
    const _microfeed = {
      is_audio: mediaFile.isAudio,
      is_document: mediaFile.isDocument,
      is_external_url: mediaFile.isExternalUrl,
      is_video: mediaFile.isVideo,
      is_image: mediaFile.isImage,
      web_url: item.webUrl,
      json_url: item.jsonUrl,
      rss_url: item.rssUrl,
      guid: item.guid,
      status: ITEM_STATUSES_DICT[item.status] ? ITEM_STATUSES_DICT[item.status].name : 'published',
    };

    if (isValidMediaFile(mediaFile)) {
      if (mediaFile.url) {
        attachment['url'] = buildAudioUrlWithTracking(mediaFile.url, trackingUrls);
      }
      if (mediaFile.contentType) {
        attachment['mime_type'] = mediaFile.contentType;
      }
      if (mediaFile.sizeByte) {
        attachment['size_in_byte'] = mediaFile.sizeByte;
      }
      if (mediaFile.durationSecond) {
        attachment['duration_in_seconds'] = mediaFile.durationSecond;
        _microfeed['duration_hhmmss'] = secondsToHHMMSS(mediaFile.durationSecond);
      }
      if (Object.keys(attachment).length > 0) {
        newItem['attachments'] = [attachment];
      }
    }
    if (item.link) {
      newItem['url'] = item.link;
    }
    if (mediaFile.isExternalUrl && mediaFile.url) {
      newItem['external_url'] = mediaFile.url;
    }

//    newItem['content_html'] = item.description || '';
//    newItem['content_text'] = item.descriptionText || '';

    // ==========================================================
    // INÍCIO DA NOSSA MODIFICAÇÃO AVANÇADA NO SERVIDOR
    // ==========================================================
    const metadataRegex = /\[meta\s+type="([^"]+)"\s+tags="([^"]*)"(?:\s+date="([^"]*)")?\]\s*/s;
    const langRegex = /\[(PT|EN|ES|LA)\](.*?)\[\/\1\]/gs;
    const rawHtml = item.description || '';
    
    // 1. Extrai Metadados (Tipo, Tags, Data)
    const metaMatch = rawHtml.match(metadataRegex);
    _microfeed.metadata = { type: 'geral', tags: [], date: null };
    let contentAfterMeta = rawHtml;

    if (metaMatch) {
        _microfeed.metadata.type = metaMatch[1];
        _microfeed.metadata.tags = metaMatch[2] ? metaMatch[2].split(',').map(t => t.trim()) : [];
        _microfeed.metadata.date = metaMatch[3] || null; // Captura a data
        contentAfterMeta = rawHtml.replace(metadataRegex, '').trim();
    }

    // 2. Extrai Conteúdo por Idioma
    newItem.content_html = {};
    newItem.content_text = {};
    let langMatches = [...contentAfterMeta.matchAll(langRegex)];

    if (langMatches.length > 0) {
        langMatches.forEach(match => {
            const lang = match[1].toLowerCase();
            const html = match[2].trim();
            newItem.content_html[lang] = html;
            newItem.content_text[lang] = htmlToPlainText(html);
        });
    } else {
        // Fallback: se não houver tags de idioma, usa o conteúdo inteiro para Português
        newItem.content_html['pt'] = contentAfterMeta;
        newItem.content_text['pt'] = htmlToPlainText(contentAfterMeta);
    }
    // ==========================================================
    // FIM DA NOSSA MODIFICAÇÃO
    // ==========================================================
    
    if (item.image) {
      newItem['image'] = item.image;
    }
    if (mediaFile.isImage && mediaFile.url) {
      newItem['banner_image'] = mediaFile.url;
    }
    if (item.pubDateRfc3339) {
      newItem['date_published'] = item.pubDateRfc3339;
    }
    if (item.updatedDateRfc3339) {
      newItem['date_modified'] = item.updatedDateRfc3339;
    }
    if (item.language) {
      newItem['language'] = item.language;
    }

    if (item['itunes:title']) {
      _microfeed['itunes:title'] = item['itunes:title'];
    }
    if (item['itunes:block']) {
      _microfeed['itunes:block'] = item['itunes:block'];
    }
    if (item['itunes:episodeType']) {
      _microfeed['itunes:episodeType'] = item['itunes:episodeType'];
    }
    if (item['itunes:season']) {
      _microfeed['itunes:season'] = parseInt(item['itunes:season'], 10);
    }
    if (item['itunes:episode']) {
      _microfeed['itunes:episode'] = parseInt(item['itunes:episode'], 10);
    }
    if (item['itunes:explicit']) {
      _microfeed['itunes:explicit'] = item['itunes:explicit'];
    }
    if (item.pubDate) {
      _microfeed['date_published_short'] = item.pubDate;
    }
    if (item.pubDateMs) {
      _microfeed['date_published_ms'] = item.pubDateMs;
    }

    newItem['_microfeed'] = _microfeed;
    return newItem;
  }

async getJsonData() {
    const publicContent = {
      version: 'https://jsonfeed.org/version/1.1',
      ...this._buildPublicContentChannel(this.content),
    };

    const {items} = this.content;
    const existingitems = items || [];
    publicContent['items'] = [];
      // ==========================================================
    // INÍCIO DA ADIÇÃO: BUSCAR E INSERIR A LITURGIA DIÁRIA
    // ==========================================================
    
    const formatLiturgyData = (liturgyData) => {
        let contentHtml = `<h1>${liturgyData.liturgia}</h1>`;
        contentHtml += `<p style="text-transform: capitalize; font-weight: bold;">Cor Litúrgica: ${liturgyData.cor}</p>`;

        const { leituras } = liturgyData;
        const renderLeituraArray = (leituraArray, tituloDefault) => {
            let html = '';
            if (leituraArray && leituraArray.length > 0) {
                leituraArray.forEach(leitura => {
                    html += `<div>`;
                    html += `<h3>${leitura.titulo || tituloDefault} (${leitura.referencia})</h3>`;
                    if (leitura.refrao) html += `<blockquote style="font-style: italic;"><strong>R.</strong> ${leitura.refrao}</blockquote>`;
                    html += `<p>${leitura.texto.replace(/\n/g, '<br>')}</p>`;
                    html += `</div>`;
                });
            }
            return html;
        };
        
        if (Object.keys(leituras).length > 0) {
            contentHtml += `<h2>Leituras</h2>`;
            contentHtml += renderLeituraArray(leituras.primeiraLeitura, 'Primeira Leitura');
            contentHtml += renderLeituraArray(leituras.salmo, 'Salmo Responsorial');
            contentHtml += renderLeituraArray(leituras.segundaLeitura, 'Segunda Leitura');
            contentHtml += renderLeituraArray(leituras.evangelho, 'Evangelho');
            if (leituras.extras) {
                leituras.extras.forEach(extra => {
                    contentHtml += renderLeituraArray([extra], extra.tipo || 'Extra');
                });
            }
        }
        
        const { oracoes } = liturgyData;
        if (Object.keys(oracoes).length > 0) {
            contentHtml += `<h2>Orações</h2>`;
            if(oracoes.coleta) contentHtml += `<h3>Coleta</h3><p>${oracoes.coleta.replace(/\n/g, '<br>')}</p>`;
            if(oracoes.oferendas) contentHtml += `<h3>Sobre as Oferendas</h3><p>${oracoes.oferendas.replace(/\n/g, '<br>')}</p>`;
            if(oracoes.comunhao) contentHtml += `<h3>Antífona da Comunhão</h3><p>${oracoes.comunhao.replace(/\n/g, '<br>')}</p>`;
            if (oracoes.extras && oracoes.extras.length > 0) {
                oracoes.extras.forEach(extra => {
                     contentHtml += `<h3>${extra.titulo}</h3><p>${extra.texto.replace(/\n/g, '<br>')}</p>`;
                });
            }
        }

        return {
            id: `liturgia-${liturgyData.data.replace(/\//g, '-')}`,
            title: `Liturgia Diária: ${liturgyData.data}`,
            url: '#liturgia',
            date_published: new Date().toISOString(),
            content_html: { pt: contentHtml },
            content_text: { pt: htmlToPlainText(contentHtml) },
            _microfeed: {
                metadata: {
                    type: "liturgia",
                    tags: [liturgyData.cor.toLowerCase()],
                    color: liturgyData.cor,
                    date: liturgyData.data
                }
            }
        };
    };

    try {
        const response = await fetch('https://liturgia.up.railway.app/v2/');
        if (response.ok) {
            const liturgyApiData = await response.json();
            const liturgyItem = formatLiturgyData(liturgyApiData);
            publicContent.items.push(liturgyItem);
        }
    } catch (error) {
        console.error("Falha ao buscar a liturgia diária:", error);
    }
    // ==========================================================
    // FIM DA ADIÇÃO
    // ==========================================================
    existingitems.forEach((item) => {
      if (![STATUSES.PUBLISHED, STATUSES.UNLISTED].includes(item.status)) {
        return;
      }
      this._decorateForItem(item, this.baseUrl);
      const mediaFile = item.mediaFile || {};
      const newItem = this._buildPublicContentItem(item, mediaFile);
      publicContent.items.push(newItem);
    })

    // Note: We don't proactively sort items based on itunes:type.
    //       Instead, we rely on ?sort= query param and settings
    // if (channel['itunes:type'] === 'episodic') {
    //   publicContent.items.sort((a, b) => b['_microfeed']['date_published_ms'] - a['_microfeed']['date_published_ms']);
    // } else {
    //   publicContent.items.sort((a, b) => a['_microfeed']['date_published_ms'] - b['_microfeed']['date_published_ms']);
    // }

    publicContent['_microfeed'] = this._buildPublicContentMicrofeedExtra(publicContent);
    return publicContent;
  }
}
