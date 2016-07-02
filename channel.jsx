import React from 'react'
import suggestBox from 'suggest-box'
import t from 'patchwork-translations'

function getChannelSuggestions (channels) {
  return channels.map(ch => {
    return {
      cls: 'user',        
      title: '#'+ch.name,
      value: ch.name
    }
  })
}

const disallowedCharRegex = /[#\s]/g
function sanitize (str) {
  return str.replace(disallowedCharRegex, '')
}

export default class ComposerChannel extends React.Component {
  static propTypes = {
    channels: React.PropTypes.array.isRequired,
    onChange: React.PropTypes.func.isRequired,

    isReadOnly: React.PropTypes.bool,
    value: React.PropTypes.string
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
    if (!input || input.isSetup)
      return
    input.isSetup = true
    suggestBox(input, { any: getChannelSuggestions(this.props.channels) }, { cls: 'msg-recipients' })
    input.addEventListener('suggestselect', this.onSuggestSelect.bind(this))
  }

  onChange(e) {
    this.props.onChange(sanitize(e.target.value))
  }

  onSuggestSelect(e) {
    this.props.onChange(sanitize(e.detail.value))
  }

  render() {
    if (this.props.isReadOnly) {
      return <div><i className="fa fa-hashtag" /> Channel: {this.props.value||<span style={{color:'#aaa'}}>none</span>}</div>
    }
    return <div className="flex flex-fill recps-inputs">
      <span><i className="fa fa-hashtag" /> Channel:</span> <input className="flex-fill" ref="input" type="text" placeholder={t('composer.ChannelPlaceholder')} value={this.props.value} onChange={this.onChange.bind(this)} />
    </div>
  }
}