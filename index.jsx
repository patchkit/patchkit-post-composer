import React from 'react'
import suggestBox from 'suggest-box'
import explain from 'explain-error'
import schemas from 'ssb-msg-schemas'
import mlib from 'ssb-msgs'
import threadlib from 'patchwork-threads'
import mime from 'mime-types'
import multicb from 'multicb'
import DropdownBtn from 'patchkit-dropdown'
import { Block as MarkdownBlock } from 'patchkit-markdown'
import { verticalFilled } from 'patchkit-vertical-filled'
import u from 'patchkit-util'
import { getDraft, saveDraft, removeDraft } from './drafts'
import ComposerChannel from './channel'
import { RECP_LIMIT, ComposerRecps } from './recps'
import mentionslib from './mentions'
import t from 'patchwork-translations'
import ssbref from 'ssb-ref'

const TEXTAREA_VERTICAL_FILL_ADJUST = -5 // remove 5 px to account for padding
const MarkdownBlockVerticalFilled = verticalFilled(MarkdownBlock)

class ComposerTextareaFixed extends React.Component {
  static propTypes = {
    onChange: React.PropTypes.func.isRequired,
    onSubmit: React.PropTypes.func.isRequired,

    suggestOptions: React.PropTypes.object
  }

  componentDidMount() {
    // setup the suggest-box
    let textarea = this.refs && this.refs.textarea
    if (!textarea || textarea.isSetup)
      return
    textarea.isSetup = true
    suggestBox(textarea, this.props.suggestOptions || {})
    textarea.addEventListener('suggestselect', this.props.onChange)
  }

  onKeyDown(e) {
    if (e.keyCode == 13 && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      e.stopPropagation()
      this.props.onSubmit()
    }
  }

  render() {
    return <textarea ref="textarea" {...this.props} onKeyDown={this.onKeyDown.bind(this)} style={{height: this.props.height+TEXTAREA_VERTICAL_FILL_ADJUST, overflow: 'auto'}} />
  }
}
const ComposerTextareaVerticalFilled = verticalFilled(ComposerTextareaFixed)

class CompositionUnit extends React.Component {
  static contextTypes = {
    events: React.PropTypes.object.isRequired,
    ssb: React.PropTypes.object.isRequired
  }

  static propTypes = {
    thread: React.PropTypes.object,
    recps: React.PropTypes.array,
    channels: React.PropTypes.array,
    channel: React.PropTypes.string,
    suggestOptions: React.PropTypes.object,
    placeholder: React.PropTypes.string,

    onSend: React.PropTypes.func.isRequired,
    onCancel: React.PropTypes.func,

    isPublic: React.PropTypes.bool,
    verticalFilled: React.PropTypes.bool,
    cancelBtn: React.PropTypes.bool
  }

  constructor(props) {
    super(props)

    // thread info
    let recps = this.props.recps || []
    this.isThreadPublic = null
    this.threadChannel = null
    this.threadRootKey = null
    if (this.props.thread && !this.isThreadMissing()) {
      const thread = this.props.thread

      // thread categorization
      this.isThreadPublic = isThreadPublic(thread)
      this.threadChannel = (thread.value.content.channel || '').trim()

      // root link
      this.threadRootKey = getThreadRoot(thread)

      // extract encryption recipients from thread
      if (thread.value && Array.isArray(thread.value.content.recps)) {
        recps = mlib.links(thread.value.content.recps)
                    .map(function (recp) { return recp.link })
                    .filter(Boolean)
      }
    }
    // setup state (pulling from thread)
    this.state = {
      isPreviewing: false,
      isSending: false,
      isPublic: this.props.isPublic || false,
      channel: this.props.channel,
      hasAddedFiles: false, // used to display a warning if a file was added in
                            // public mode, then they switch to private
      addedFileMeta: {}, // map of file hash -> metadata
      recps: recps,
      text: getDraft(this.getDraftId())
    }
  }

  isReply() {
    return !!this.props.thread
  }

  isThreadMissing() {
    return this.isReply() && !this.props.thread.value
  }

  getDraftId() {
    return this.threadRootKey || 'new-thread'
  }

  isPublic() {
    return (this.isReply()) ? this.isThreadPublic : this.state.isPublic
  }

  hasChannel() { return !!this.getChannel() }

  getChannel() {
    return (this.isReply()) ? this.threadChannel : this.state.channel
  }

  onChangeText(event) {
    saveDraft(this.getDraftId(), event.target.value)
    this.setState({ text: event.target.value })
  }

  onAttach() { this.refs.files.click() } // trigger file-selector

  // called by the files selector when files are chosen
  onFilesAdded() {
    var done = multicb({ pluck: 1 })
    var filesInput = this.refs.files
    var handled=0, total = filesInput.files.length
    this.setState({ isAddingFiles: true, hasAddedFiles: true })

    let add = (f) => {
      // limit to 5mb
      if (f.size > 5 * (1024*1024)) {
        var inMB = Math.round(f.size / (1024*1024) * 100) / 100
        this.context.events.emit('error', new Error(t('TooLarge', {
          name: f.name,
          limit: 5,
          size: inMB
        })))
        this.setState({ isAddingFiles: false })
        return false
      }

      // read, hash, and store
      var reader = new FileReader()
      reader.onload = () => {
        var buff64 = new Buffer(new Uint8Array(reader.result)).toString('base64')
        this.context.ssb.patchwork.addFileToBlobs(buff64, next)
      }
      reader.onerror = function (e) {
        console.error(e)
        next(new Error(t('error.upload', {name: f.name})))
      }
      const next = (err, hash) => {
        if (err) {
          this.context.events.emit('error', explain(err, t('error.attaching')))
        } else {
          var name = f.name || t('composer.defaultFilename')
          // insert the mention
          var str = ''
          if (!(/(^|\s)$/.test(this.state.text)))
            str += ' ' // add some space if not on a newline
          if (isImageFilename(f.name))
            str += '!' // inline the image
          str += '['+name+']('+hash+')'
          this.setState({ text: this.state.text + str })

          // capture metadata
          var meta = this.state.addedFileMeta[hash] = {
            name: name,
            size: f.size
          }
          if (f.type)
            meta.type = f.type
          else if (mime.contentType(f.name))
            meta.type = mime.contentType(f.name)
          
          this.setState({ addedFileMeta: this.state.addedFileMeta })
        }
        if (++handled >= total)
          this.setState({ isAddingFiles: false })
      }
      reader.readAsArrayBuffer(f)
      return true
    }

    // hash the files
    for (var i=0; i < total; i++) {
      if (!add(filesInput.files[i])) { return false }
    }
    filesInput.value = '' // clear file list
  }

  onSelectPublic(value) {
    if (this.isReply()) { return } // cant change if a reply
    this.setState({ isPublic: value })
  }

  onChangeChannel(name) {
    if (this.isReply()) { return } // cant change if a reply
    this.setState({ channel: name })
  }

  onAddRecp(id) {
    let recps = this.state.recps

    // enforce limit
    if (recps.length >= RECP_LIMIT) { return }

    // remove if already exists (we'll push to end of list so user sees its
    // there)
    var i = recps.indexOf(id)
    if (i !== -1) { recps.splice(i, 1) }
    recps.push(id)
    this.setState({ recps: recps })
  }

  onRemoveRecp(id) {
    let recps = this.state.recps
    var i = recps.indexOf(id)
    if (i !== -1) {
      recps.splice(i, 1)
      this.setState({ recps: recps })
    }
  }

  canSend() {
    const hasText = !!this.state.text.trim()
    const hasRecp = this.isPublic() || this.state.recps.length > 0
    return hasText && hasRecp
  }

  // onSend() is not defined in this superclass because different components
  // like Editor or Composer do it differently. If you extend this class, make
  // sure to define it if you want it.

  // Stateless components

  // These components are just purefunctional, common pieces of the
  // CompositionUnit that can make the render() method well and cluttered.
  renderComposerTextarea(vertical) {
    return (vertical ? ComposerTextareaVerticalFilled : ComposerTextareaFixed)
  }

  static Preview(props) {
    if (!props.text)
      return <span/>
    return <div className="preview">
      <div className="muted">
        <small>{t('composer.preview')}</small>
        <a className="float-right" onClick={props.togglePreviewing}>&times;</a>
      </div>
      <MarkdownBlock md={props.text} />
    </div>
  }

  renderAudienceBtn(props) {
    return (props) => {
      const opts = [
        { label: <span><i className="fa fa-lock"/> {t('Private')}</span>,
          value: false },
        { label: <span><i className="fa fa-bullhorn"/> {t('Public')}</span>,
          value: true }
      ]
      var curOpt = !!props.isPublic ? 1 : 0
      if (!props.canChange) {
        return (<a className="btn disabled">{opts[curOpt].label}</a>)
      } else {
        return (<DropdownBtn className="btn" 
                             items={opts} 
                             onSelect={props.onSelect}>
                   {opts[curOpt].label} <i className="fa fa-caret-down" />
                </DropdownBtn>)
      }
    }
  }

  renderAttachBtn(props) {
    return (props) => {
      if (!props.isPublic) {
        if (props.isReply) {
          return <span/>
        } else {
          return <a className="btn disabled"><i className="fa fa-paperclip" /> {t('composer.AttachmentsNotAvailable')}</a>
        }
      }
      if (props.isAdding) {
        return <a className="btn disabled"><i className="fa fa-paperclip" /> {t('composer.Adding')}</a>
      } else {
        return <a className="btn" onClick={props.onAttach}><i className="fa fa-paperclip" /> {t('composer.AddAttachment')}</a>
      }
    }
  }

  renderSendBtn(props) {
    return (props) => {
      const sendIcon = (this.isPublic()) ? 'users' : 'lock'
      if (!props.canSend) {
        return <a className="btn disabled">{t('Send')}</a>
      } else {
        return <a className="btn highlighted" onClick={this.onSend.bind(this)}>
          <i className={`fa fa-${sendIcon}`}/> {t('Send')}
        </a>
      }
    }
  }

  togglePreviewing() {
    return this.setState({ isPreviewing: !this.state.isPreviewing })
  }

  renderComposerArea() {
    if (this.isThreadMissing())
      return <span/> // dont render

    const channel = this.getChannel()
    const vertical = this.props.verticalFilled
    const togglePreviewing = this.togglePreviewing.bind(this)
    const ComposerTextarea = this.renderComposerTextarea(vertical)
    const AudienceBtn = this.renderAudienceBtn(this.props)
    const AttachBtn = this.renderAttachBtn(this.props)
    const SendBtn = this.renderSendBtn(this.props)

    return (
        <div className="composer">
          <input ref="files"
                 type="file" multiple
                 onChange={this.onFilesAdded.bind(this)}
                 style={{display: 'none'}} />
          { this.isReply()
            ? '' /* no channel/recps control for replies */
            : <div className="composer-ctrls composer-recps flex">
                <AudienceBtn canChange isPublic={this.isPublic()} onSelect={this.onSelectPublic.bind(this)} />
                { this.isPublic()
                  ? <ComposerChannel channels={this.props.channels||[]} onChange={this.onChangeChannel.bind(this)} value={this.getChannel()} />
                  : <ComposerRecps recps={this.state.recps} suggestOptions={this.props.suggestOptions} onAdd={this.onAddRecp.bind(this)} onRemove={this.onRemoveRecp.bind(this)} /> 
                }
                { this.props.cancelBtn ? <a className="btn" onClick={this.props.onCancel}><i className="fa fa-times" /> {t('Cancel')}</a> : '' }
              </div>
          }
          <div className="composer-content">
            <ComposerTextarea
                ref="textarea"
                value={this.state.text}
                onChange={this.onChangeText.bind(this)}
                onSubmit={this.onSend.bind(this)}
                suggestOptions={this.props.suggestOptions}
                placeholder={this.isReply() ?
                             t('composer.WriteReply') :
                             (this.props.placeholder||t('composer.WriteMessage'))} />
          </div>
          <div className="composer-ctrls flex">
            <AttachBtn isPublic={this.isPublic()} 
                       isReply={this.isReply()} 
                       hasAdded={this.state.hasAddedFiles} 
                       isAdding={this.state.isAddingFiles} 
                       onAttach={this.onAttach.bind(this)} />
            <div className="flex-fill" />
            { this.state.isPreviewing ? '' : <a className="btn" onClick={togglePreviewing}>{t('composer.Preview')}</a> }
            <SendBtn canSend={this.canSend() && !this.state.isSending} />
          </div>
          { this.state.isPreviewing ? <CompositionUnit.Preview text={this.state.text} togglePreviewing={togglePreviewing} /> : '' }
        </div>)
  }
  

  render() {
    return this.renderComposerArea()
  }
}

export default class Composer extends CompositionUnit {
  static contextTypes = {
    events: React.PropTypes.object.isRequired,
    ssb: React.PropTypes.object.isRequired,
    users: React.PropTypes.object.isRequired,
    user: React.PropTypes.object.isRequired
  }

  static propTypes = {
    thread: React.PropTypes.object,
    recps: React.PropTypes.array,
    channels: React.PropTypes.array,
    channel: React.PropTypes.string,
    suggestOptions: React.PropTypes.object,
    placeholder: React.PropTypes.string,

    onSend: React.PropTypes.func.isRequired,
    onCancel: React.PropTypes.func,

    isPublic: React.PropTypes.bool,
    verticalFilled: React.PropTypes.bool,
    cancelBtn: React.PropTypes.bool
  }

  constructor(props) {
    super(props)
  }

  onSend() {
    const ssb = this.context.ssb
    var text = this.state.text
    if (!text.trim())
      return

    this.setState({ isSending: true })

    // prep text
    mentionslib.extract(ssb, text, (err, mentions) => {
      if (err) {
        this.setState({ isSending: false })
        if (err.conflict) {
          this.context.events.emit('error',
            new Error(t('error.nameDupPublish', { name: err.name })))
        } else {
          this.context.events.emit('error', explain(err, t('error.publish')))
        }
        return
      }

      // add file meta to mentions
      if (mentions && mentions.length) {
        mentions.forEach(mention => {
          var meta = this.state.addedFileMeta[mention.link]
          if (meta) {
            for (var k in meta) {
              if (k != 'link')
                mention[k] = meta[k]
            }
          }
        })
      }

      let channel = this.getChannel()
      let recps = null, recpLinks = null
      if (!this.isPublic()) {
        // no channel on private msgs
        channel = false

        // setup recipients
        recps = this.state.recps

        // make sure the user is in the recipients
        if (recps.indexOf(this.context.user.id) === -1)
          recps.push(this.context.user.id)

        // setup links
        recpLinks = recps.map((id) => {
          let name = u.getName(this.context.users, id)
          return (name) ? { link: id, name: name } : id
        })
      }

      // publish
      const threadBranchKey = this.props.thread && threadlib.getLastThreadPost(this.props.thread).key
      var post = schemas.post(text, this.threadRootKey, threadBranchKey, mentions, recpLinks, channel)
      let published = (err, msg) => {
        this.setState({ isSending: false })
        if (err) { 
          this.context.events.emit(explain(err, t('PublishError')))
        } else {
          // reset form
          this.setState({ text: '', isPreviewing: false })
          removeDraft(this.getDraftId())

          // give user feedback
          if (this.isReply())
            this.context.events.emit('notice', t('composer.PublishedReply'))
          else if (this.isPublic())
            this.context.events.emit('notice', t('composer.PublishedPost'))
          else
            this.context.events.emit('notice', t('composer.PublishedPrivate'))

          // mark read (include the thread root because the api will
          // automatically mark the root unread on new reply)
          ssb.patchwork.markRead((this.threadRootKey) ? 
                                     [this.threadRootKey, msg.key] : 
                                     msg.key)
          // auto-bookmark the thread
          ssb.patchwork.bookmark(this.threadRootKey || msg.key)

          // call handler
          if (this.props.onSend instanceof Function) { this.props.onSend(msg) }
        }
      }
      if (recps){ ssb.private.publish(post, recps, published) } 
      else {
        var done = multicb({ pluck: 1, spread: true })
        ssb.publish(post, done())
        if (ssb.blobs.push) {
          mentions.forEach(mention => {
            if (ssbref.isBlobId(mention.link)) {
              ssb.blobs.push(mention.link, done())
            }
          })
        }
        done(published)
      }
    })
  }

  render() {
    return this.renderComposerArea()
  }
}

function isThreadPublic (thread) {
  if ('plaintext' in thread)
    return thread.plaintext
  return (typeof thread.value.content !== 'string')
}

function getThreadRoot (msg) {
  var root = msg && msg.value && msg.value.content && msg.value.content.root
  if (root && mlib.link(root, 'msg')) { return mlib.link(root, 'msg').link }
  else return msg.key
}

function isImageFilename (name) {
  if (typeof name !== 'string')
    return false
  return isImageContentType(mime.contentType(name))
}

function isImageContentType (ct) {
  return (typeof ct == 'string' && ct.indexOf('image/') === 0)
}
