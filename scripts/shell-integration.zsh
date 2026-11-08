# Source from ~/.zshrc, after configuring your prompt.
if [[ -z ${__rhino_integration:-} ]]; then
  __rhino_integration=1
  autoload -Uz add-zsh-hook
  __rhino_precmd() {
    local rhino_status=$? uri_path=$PWD
    uri_path=${uri_path//\%/%25}
    uri_path=${uri_path// /%20}
    uri_path=${uri_path//#/%23}
    uri_path=${uri_path//\?/%3F}
    printf '\e]133;D;%d\a\e]7;file://localhost%s\a\e]133;A\a' "$rhino_status" "$uri_path"
    return "$rhino_status"
  }
  __rhino_preexec() { printf '\e]133;C\a'; }
  add-zsh-hook precmd __rhino_precmd
  add-zsh-hook preexec __rhino_preexec
  PS1=${PS1}$'%{\e]133;B\a%}'
fi
