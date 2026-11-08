# Source from ~/.bashrc (Bash 4.4+). Keep existing prompt hooks and their status.
if [[ -z ${__rhino_integration:-} ]]; then
  __rhino_integration=1
  __rhino_prompt() {
    local rhino_status=$? uri_path=$PWD
    if [[ ${OS:-} == Windows_NT ]]; then uri_path="/$(pwd -W)"; fi
    uri_path=${uri_path//%/%25}
    uri_path=${uri_path// /%20}
    uri_path=${uri_path//#/%23}
    uri_path=${uri_path//\?/%3F}
    printf '\e]133;D;%d\a\e]7;file://localhost%s\a\e]133;A\a' "$rhino_status" "$uri_path"
    return "$rhino_status"
  }
  if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == 'declare -a'* ]]; then
    PROMPT_COMMAND=(__rhino_prompt "${PROMPT_COMMAND[@]}")
  else
    PROMPT_COMMAND="__rhino_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
  fi
  PS0=${PS0-}$'\e]133;C\a'
  PS1=${PS1-}'\[\e]133;B\a\]'
fi
