#!/bin/bash

#!/bin/bash

_build_cubrid_completion()
{
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    # 두 번째 인자 자동완성: "d", "debug", "r", "release"
    COMPREPLY=($(compgen -W "d debug r release p profile" -- "${COMP_WORDS[COMP_CWORD]}"))
  elif [[ ${COMP_CWORD} -eq 2 ]]; then
    case "${COMP_WORDS[1]}" in
      d|debug)
        # "~/debug" 디렉토리 내 폴더 이름에서 "CUBRID-" 제거 후 자동완성, 마지막 슬래시 제거
        local IFS=$'\n'
        local folders=($(ls -d ~/debug/CUBRID-*/))
        local suggestions=($(for folder in "${folders[@]}"; do echo "${folder#*/CUBRID-}" | sed 's/\/$//'; done))
        COMPREPLY=($(compgen -W "${suggestions[*]}" -- "${COMP_WORDS[COMP_CWORD]}"))
        ;;
      r|release)
        # "~/release" 디렉토리 내 폴더 이름에서 "CUBRID-" 제거 후 자동완성, 마지막 슬래시 제거
        local IFS=$'\n'
        local folders=($(ls -d ~/release/CUBRID-*/))
        local suggestions=($(for folder in "${folders[@]}"; do echo "${folder#*/CUBRID-}" | sed 's/\/$//'; done))
        COMPREPLY=($(compgen -W "${suggestions[*]}" -- "${COMP_WORDS[COMP_CWORD]}"))
        ;;
      p|profile)
        # "~/profile" 디렉토리 내 폴더 이름에서 "CUBRID-" 제거 후 자동완성, 마지막 슬래시 제거
        local IFS=$'\n'
        local folders=($(ls -d ~/profile/CUBRID-*/))
        local suggestions=($(for folder in "${folders[@]}"; do echo "${folder#*/CUBRID-}" | sed 's/\/$//'; done))
        COMPREPLY=($(compgen -W "${suggestions[*]}" -- "${COMP_WORDS[COMP_CWORD]}"))
        ;;
    esac
  fi
  return 0
}

complete -F _build_cubrid_completion build_cubrid.sh