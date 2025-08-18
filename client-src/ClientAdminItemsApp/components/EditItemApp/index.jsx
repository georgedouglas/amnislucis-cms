import React from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import AdminNavApp from '../../../components/AdminNavApp';
import AdminInput from "../../../components/AdminInput";
import Requests from "../../../common/requests";
import {randomShortUUID, ADMIN_URLS, PUBLIC_URLS} from '../../../../common-src/StringUtils';
import AdminImageUploaderApp from "../../../components/AdminImageUploaderApp";
import AdminDatetimePicker from '../../../components/AdminDatetimePicker';
import {datetimeLocalStringToMs, datetimeLocalToMs} from "../../../../common-src/TimeUtils";
import {getPublicBaseUrl} from "../../../common/ClientUrlUtils";
import AdminRadio from "../../../components/AdminRadio";
import {showToast} from "../../../common/ToastUtils";
import {unescapeHtml} from "../../../../common-src/StringUtils";
import MediaManager from "./components/MediaManager";
import {
  NAV_ITEMS,
  NAV_ITEMS_DICT,
  STATUSES,
  ITEM_STATUSES_DICT,
} from "../../../../common-src/Constants";
import {AdminSideQuickLinks, SideQuickLink} from "../../../components/AdminSideQuickLinks";
import AdminRichEditor from "../../../components/AdminRichEditor";
import ExplainText from "../../../components/ExplainText";
import {
  ITEM_CONTROLS,
  CONTROLS_TEXTS_DICT
} from "./FormExplainTexts";
import {preventCloseWhenChanged} from "../../../common/BrowserUtils";
import {getMediaFileFromUrl} from "../../../../common-src/MediaFileUtils";

const SUBMIT_STATUS__START = 1;

// NOVO: Nossa RegEx para encontrar e manipular os metadados
const metadataRegex = /\[meta\s+type="([^"]+)"\s+tags="([^"]*)"\]\s*/s;

function initItem(itemId) {
  return ({
    status: STATUSES.PUBLISHED,
    pubDateMs: datetimeLocalToMs(new Date()),
    guid: itemId,
    'itunes:explicit': false,
    'itunes:block': false,
    'itunes:episodeType': 'full',
  });
}

export default class EditItemApp extends React.Component {
  constructor(props) {
    super(props);

    this.onSubmit = this.onSubmit.bind(this);
    this.onDelete = this.onDelete.bind(this);
    this.onUpdateFeed = this.onUpdateFeed.bind(this);
    this.onUpdateItemMeta = this.onUpdateItemMeta.bind(this);
    this.onUpdateItemToFeed = this.onUpdateItemToFeed.bind(this);
    // NOVO: Bind da nossa nova função
    this._updateDescriptionWithMetadata = this._updateDescriptionWithMetadata.bind(this);

    const $feedContent = document.getElementById('feed-content');
    const $dataParams = document.getElementById('lh-data-params');
    const onboardingResult = JSON.parse(unescapeHtml(document.getElementById('onboarding-result').innerHTML));

    const itemId = $dataParams ? $dataParams.getAttribute('data-item-id') : null;
    const action = itemId ? 'edit' : 'create';
    const feed = JSON.parse(unescapeHtml($feedContent.innerHTML));
    if (!feed.items) {
      feed.items = [];
    }
    const item = feed.item || initItem();

    // REMOVEMOS os estados de metadados. A única fonte da verdade é item.description
    this.state = {
      feed,
      onboardingResult,
      item,
      submitStatus: null,
      itemId: itemId || randomShortUUID(),
      action,
      userChangedLink: false,
      changed: false,
    };
  }

  // NOVO: Função para atualizar a description com base nos metadados
  _updateDescriptionWithMetadata(newMeta) {
    const { metadataType: currentType, metadataTags: currentTags } = this.state;
    const newType = newMeta.type !== undefined ? newMeta.type : currentType;
    const newTags = newMeta.tags !== undefined ? newMeta.tags : currentTags;
    
    this.setState({
        metadataType: newType,
        metadataTags: newTags,
    });

    const currentDescription = this.state.item.description || '';
    const cleanedDescription = currentDescription.replace(metadataRegex, '');

    // Não adiciona metadados se o tipo for 'geral'
    if (newType === 'geral' || !newType) {
        this.onUpdateItemMeta({ 'description': cleanedDescription });
        return;
    }
    
    const newShortcode = `[meta type="${newType}" tags="${newTags}"]`;
    const finalDescription = `${newShortcode}\n\n${cleanedDescription}`;
    
    this.onUpdateItemMeta({ 'description': finalDescription });
  }
  
  componentDidMount() {
    preventCloseWhenChanged(() => this.state.changed);

    // NOVO: Parsear a description ao carregar a página para popular os campos
    const description = this.state.item.description || '';
    const match = description.match(metadataRegex);
    if (match) {
        this.setState({
            metadataType: match[1],
            metadataTags: match[2],
        });
    }

    const {action, item} = this.state;
    if (action === 'create') {
      const {mediaFile} = item;
      const urlParams = new URLSearchParams(window.location.search);
      const title = urlParams.get('title') || '';

      const mediaFileFromUrl = getMediaFileFromUrl(urlParams);

      if (mediaFileFromUrl && Object.keys(mediaFileFromUrl).length > 0) {
        const attrDict = {
          title,
          mediaFile: {
            ...mediaFile,
            ...mediaFileFromUrl,
          },
        };
        this.onUpdateItemMeta(attrDict);
      }
    }
  }

  // NOVA FUNÇÃO: Único ponto para manipular mudanças nos campos de metadados
  handleMetadataChange(newMeta) {
    const currentDescription = this.state.item.description || '';
    const cleanedDescription = currentDescription.replace(metadataRegex, '').trim();

    const match = currentDescription.match(metadataRegex);
    const currentType = match ? match[1] : 'geral';
    const currentTags = match ? match[2] : '';

    const newType = newMeta.type !== undefined ? newMeta.type : currentType;
    const newTags = newMeta.tags !== undefined ? newMeta.tags : currentTags;
    
    let finalDescription = cleanedDescription;

    if (newType !== 'geral' && newType) {
      const newShortcode = `[meta type="${newType}" tags="${newTags}"]`;
      finalDescription = `${newShortcode}\n\n${cleanedDescription}`;
    }

    this.onUpdateItemMeta({ 'description': finalDescription });
  }
  
  onUpdateFeed(props, onSuccess) {
    this.setState(prevState => ({
      feed: {
        ...prevState.feed,
        ...props,
      },
    }), () => onSuccess())
  }

  onUpdateItemMeta(attrDict, extraDict) {
    this.setState(prevState => ({
      changed: true,
      item: {...prevState.item, ...attrDict,},
      ...extraDict,
    }));
  }

  onUpdateItemToFeed(onSuccess) {
    let {item, itemId, feed} = this.state;
    const itemsBundle = {
      ...feed.items,
      [itemId]: {...item},
    };
    this.onUpdateFeed({'items': itemsBundle}, onSuccess);
  }

  onDelete() {
    const {item} = this.state;
    this.setState({submitStatus: SUBMIT_STATUS__START});
    Requests.axiosPost(ADMIN_URLS.ajaxFeed(), {item: {...item, status: STATUSES.DELETED}})
      .then(() => {
        showToast('Deleted!', 'success');
        this.setState({submitStatus: null, changed: false}, () => {
          setTimeout(() => {
            location.href = ADMIN_URLS.allItems();
          }, 1000);
        });
      })
      .catch((error) => {
        this.setState({submitStatus: null}, () => {
          if (!error.response) {
            showToast('Network error. Please refresh the page and try again.', 'error');
          } else {
            showToast('Failed. Please try again.', 'error');
          }
        });
      });
  }

  onSubmit(e) {
    e.preventDefault();
    const {item, itemId, action} = this.state;
    this.setState({submitStatus: SUBMIT_STATUS__START});
    Requests.axiosPost(ADMIN_URLS.ajaxFeed(), {item: {id: itemId, ...item}})
      .then(() => {
        this.setState({submitStatus: null, changed: false}, () => {
          if (action === 'edit') {
            showToast('Updated!', 'success');
          } else {
            showToast('Created!', 'success');
            if (itemId) {
              setTimeout(() => {
                location.href = ADMIN_URLS.editItem(itemId);
              }, 1000);
            }
          }
        });
      }).catch((error) => {
      this.setState({submitStatus: null}, () => {
        if (!error.response) {
          showToast('Network error. Please refresh the page and try again.', 'error');
        } else {
          showToast('Failed. Please try again.', 'error');
        }
      });
    });
  }

  render() {
    const {submitStatus, itemId, item, action, feed, onboardingResult, changed} = this.state;
    const submitting = submitStatus === SUBMIT_STATUS__START;
    const {mediaFile} = item;
    const status = item.status || STATUSES.PUBLISHED;
    const webGlobalSettings = feed.settings.webGlobalSettings || {};
    const publicBucketUrl = webGlobalSettings.publicBucketUrl || '';
    
    // VALORES DERIVADOS: Extraímos os metadados da description a cada renderização
    const description = item.description || '';
    const match = description.match(metadataRegex);
    const metadataType = match ? match[1] : 'geral';
    const metadataTags = match ? match[2] : '';

    let buttonText = 'Create';
    let submittingButtonText = 'Creating...';
    let currentPage = NAV_ITEMS.NEW_ITEM;
    let upperLevel;
    if (action === 'edit') {
      buttonText = 'Update';
      submittingButtonText = 'Updating...';
      currentPage = NAV_ITEMS.ALL_ITEMS;
      upperLevel = {
        name: NAV_ITEMS_DICT[NAV_ITEMS.ALL_ITEMS].name,
        url: ADMIN_URLS.allItems(),
        childName: `Item (id = ${itemId})`,
      };
    }
    return (<AdminNavApp
      currentPage={currentPage}
      upperLevel={upperLevel}
      onboardingResult={onboardingResult}
    >
      <form className="grid grid-cols-12 gap-4">
        <div className="col-span-9 grid grid-cols-1 gap-4">
          <div className="lh-page-card">
            
            <MediaManager
              labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.MEDIA_FILE]}/>}
              feed={feed}
              initMediaFile={mediaFile || {}}
              onMediaFileUpdated={(newMediaFile) => {
                this.onUpdateItemMeta({
                  mediaFile: {
                    ...mediaFile,
                    ...newMediaFile,
                  },
                });
              }}
            />
          </div>
          <div className="lh-page-card">
            <div className="flex">
              <div>
                <ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.IMAGE]}/>
                <AdminImageUploaderApp
                  mediaType="item"
                  feed={feed}
                  currentImageUrl={item.image}
                  onImageUploaded={(cdnUrl) => this.onUpdateItemMeta({'image': cdnUrl})}
                />
              </div>
              <div className="ml-8 flex-1">
                <AdminInput
                  labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.TITLE]}/>}
                  value={item.title}
                  onChange={(e) => {
                    const attrDict = {'title': e.target.value};
                    if (action !== 'edit' && !this.state.userChangedLink) {
                      attrDict.link = PUBLIC_URLS.webItem(itemId, item.title, getPublicBaseUrl());
                    }
                    this.onUpdateItemMeta(attrDict);
                  }}
                />
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <AdminDatetimePicker
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.PUB_DATE]}/>}
                    value={item.pubDateMs}
                    onChange={(e) => {
                      this.onUpdateItemMeta({'pubDateMs': datetimeLocalStringToMs(e.target.value)});
                    }}
                  />
                  <AdminInput
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.LINK]}/>}
                    value={item.link}
                    onChange={(e) => this.onUpdateItemMeta({'link': e.target.value}, {userChangedLink: true})}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 mt-4">
                  <AdminRadio
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.STATUS]}/>}
                    groupName="item-status"
                    buttons={[
                      {
                        name: ITEM_STATUSES_DICT[STATUSES.PUBLISHED].name,
                        value: STATUSES.PUBLISHED,
                        checked: status === STATUSES.PUBLISHED,
                      },
                      {
                        name: ITEM_STATUSES_DICT[STATUSES.UNLISTED].name,
                        value: STATUSES.UNLISTED,
                        checked: status === STATUSES.UNLISTED,
                      },
                      {
                        name: ITEM_STATUSES_DICT[STATUSES.UNPUBLISHED].name,
                        value: STATUSES.UNPUBLISHED,
                        checked: status === STATUSES.UNPUBLISHED,
                      }]}
                    onChange={(e) => {
                      this.onUpdateItemMeta({'status': parseInt(e.target.value, 10)})
                    }}
                  />
                  <div className="text-muted-color text-xs" dangerouslySetInnerHTML={{__html: ITEM_STATUSES_DICT[status].description}} />
                </div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t">
                <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Metadados da Aplicação</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="metadata-type" className="block text-sm font-medium text-gray-700">
                            Tipo de Conteúdo
                        </label>
                        <select
                            id="metadata-type"
                            name="metadata-type"
                            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                            value={metadataType}
                            onChange={(e) => this._updateDescriptionWithMetadata({ type: e.target.value })}
                        >
                            <option value="geral">Geral</option>
                            <option value="santo">Santo</option>
                            <option value="oracao">Oração</option>
                        </select>
                    </div>
                    <AdminInput
                        labelComponent={<label className="block text-sm font-medium text-gray-700">Tags (separadas por vírgula)</label>}
                        value={metadataTags}
                        onChange={(e) => this._updateDescriptionWithMetadata({ tags: e.target.value })}
                    />
                </div>
            </div>
            
            <div className="mt-8 pt-8 border-t">
              <AdminRichEditor
                labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.DESCRIPTION]}/>}
                value={item.description}
                onChange={(value) => {
                    this.onUpdateItemMeta({'description': value});
                }}
                extra={{
                  publicBucketUrl,
                  folderName: `items/${itemId}`,
                }}
              />
            </div>
          </div>
          <div className="lh-page-card">
            <details>
              <summary className="m-page-summary">Podcast-specific fields</summary>
              <div className="grid grid-cols-1 gap-8">
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <AdminRadio
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.ITUNES_EXPLICIT]}/>}
                    groupName="lh-explicit"
                    buttons={[{
                      'name': 'yes',
                      'checked': item['itunes:explicit'],
                    }, {
                      'name': 'no',
                      'checked': !item['itunes:explicit'],
                    }]}
                    value={item['itunes:explicit']}
                    onChange={(e) => this.onUpdateItemMeta({'itunes:explicit': e.target.value === 'yes'})}
                  />
                  <AdminInput
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.GUID]}/>}
                    value={item.guid || itemId}
                    setRef={(ref) => {
                      if (!item.guid && ref) {
                        this.onUpdateItemMeta({'guid': ref.value}, {changed: false});
                      }
                    }}
                    onChange={(e) => this.onUpdateItemMeta({'guid': e.target.value})}
                  />
                  <AdminInput
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.ITUNES_TITLE]}/>}
                    value={item['itunes:title']}
                    onChange={(e) => this.onUpdateItemMeta({'itunes:title': e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <AdminRadio
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.ITUNES_EPISODE_TYPE]}/>}
                    groupName="feed-itunes-episodetype"
                    buttons={[{
                      'name': 'full',
                      'checked': item['itunes:episodeType'] === 'full',
                    }, {
                      'name': 'trailer',
                      'checked': item['itunes:episodeType'] === 'trailer',
                    }, {
                      'name': 'bonus',
                      'checked': item['itunes:episodeType'] === 'bonus',
                    },
                    ]}
                    value={item['itunes:episodeType']}
                    onChange={(e) => this.onUpdateItemMeta({'itunes:episodeType': e.target.value})}
                  />
                  <AdminInput
                    type="number"
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.ITUNES_SEASON]}/>}
                    value={item['itunes:season']}
                    extraParams={{min: "1"}}
                    onChange={(e) => this.onUpdateItemMeta({'itunes:season': e.target.value})}
                  />
                  <AdminInput
                    type="number"
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.ITUNES_EPISODE]}/>}
                    value={item['itunes:episode']}
                    extraParams={{min: "1"}}
                    onChange={(e) => this.onUpdateItemMeta({'itunes:episode': e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <AdminRadio
                    labelComponent={<ExplainText bundle={CONTROLS_TEXTS_DICT[ITEM_CONTROLS.ITUNES_BLOCK]}/>}
                    groupName="feed-itunes-block"
                    buttons={[{
                      'name': 'Yes',
                      'checked': item['itunes:block'],
                    }, {
                      'name': 'No',
                      'checked': !item['itunes:block'],
                    }]}
                    value={item['itunes:block']}
                    onChange={(e) => this.onUpdateItemMeta({'itunes:block': e.target.value === 'Yes'})}
                  />
                </div>
              </div>
            </details>
          </div>
        </div>
        <div className="col-span-3">
          <div className="sticky top-8">
            <div className="lh-page-card text-center">
              <button
                type="submit"
                className="lh-btn lh-btn-brand-dark lh-btn-lg"
                onClick={this.onSubmit}
                disabled={submitting || !changed}
              >
                {submitting ? submittingButtonText : buttonText}
              </button>
            </div>
            {action === 'edit' && <div>
              <AdminSideQuickLinks
                AdditionalLinksDiv={<div className="flex flex-wrap">
                  <SideQuickLink url={PUBLIC_URLS.webItem(itemId, item.title)} text="web item"/>
                  <SideQuickLink url={PUBLIC_URLS.jsonItem(itemId)} text="json item"/>
                </div>}
              />
              <div className="lh-page-card mt-4 flex justify-center">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    const ok = confirm('Are you going to permanently delete this item?');
                    if (ok) {
                      this.onDelete();
                    }
                  }
                }><div className="flex items-center text-red-500 text-sm hover:text-brand-light">
                  <TrashIcon className="w-4" />
                  <div className="ml-1">Delete this item</div>
                  </div>
                </a>
              </div>
            </div>}
          </div>
        </div>
      </form>
    </AdminNavApp>);
  }
}
