import React from 'react'
import suggestBox from 'suggest-box'
import u from 'patchkit-util'
import social from 'patchkit-util/social'
import t from 'patchwork-translations'

export const RECP_LIMIT = 7

class ComposerRecp extends React.Component {
  static contextTypes = {
    users: React.PropTypes.object.isRequired
  }

  static propTypes = {
    id: React.PropTypes.string.isRequired,
    isReadOnly: React.PropTypes.bool
  }

  render() {
    return <span className="recp">
      {u.getName(this.context.users, this.props.id)}
      {this.props.isReadOnly ? '' : <a onClick={() => this.props.onRemove(this.props.id)}><i className="fa fa-remove"/></a>}
    </span>
  }
}

export class ComposerRecps extends React.Component {
  static contextTypes = {
    users: React.PropTypes.object.isRequired,
    user: React.PropTypes.object.isRequired
  }

  static propTypes = {
    onAdd: React.PropTypes.func.isRequired,
    onRemove: React.PropTypes.func.isRequired,
    recps: React.PropTypes.array.isRequired,

    suggestOptions: React.PropTypes.object,
    isReadOnly: React.PropTypes.bool
  }

  constructor(props) {
    super(props)
    this.state = { inputText: '' }
  }

  componentDidMount() {
    this.setupSuggest()
  }
  componentDidUpdate() {
    this.setupSuggest()
  }
  setupSuggest() {
    // setup the suggest-box
    const input = this.refs && this.refs.input
    if (!input || input.isSetup || !this.props.suggestOptions)
      return
    input.isSetup = true
    suggestBox(input, { any: this.props.suggestOptions['@'] }, { cls: 'msg-recipients' })
    input.addEventListener('suggestselect', this.onSuggestSelect.bind(this))
  }

  onChange(e) {
    this.setState({ inputText: e.target.value })
  }

  onSuggestSelect(e) {
    this.props.onAdd(e.detail.id)
    this.setState({ inputText: '' })
  }

  render() {
    const isAtLimit = (this.props.recps.length >= RECP_LIMIT)
    const warnings = this.props.recps.filter((id) => (id !== this.context.user.id) && !social.follows(this.context.users, id, this.context.user.id))
    return <div className="recps-inputs flex-fill">
      <i className="fa fa-user" /> {t('thread.ToRecps')} {this.props.recps.map((r) => <ComposerRecp key={r} id={r} onRemove={this.props.onRemove} isReadOnly={this.props.isReadOnly} />)}
      { (!isAtLimit && !this.props.isReadOnly) ?
        <input ref="input" type="text" placeholder={t('composer.AddRecipients')} value={this.state.inputText} onChange={this.onChange.bind(this)} {...this.props} /> :
        '' }
      { isAtLimit ? <div className="warning">{t('composer.RecipientLimitReached')}</div> : '' }
      { warnings.length
        ? warnings.map((id, i) => <div key={'warning-'+i} className="warning">{t('composer.NotFollowedWarning', {name: u.getName(this.context.users, id)})}</div>)
        : '' }
    </div>
  }
}