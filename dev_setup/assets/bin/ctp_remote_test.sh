#!/bin/bash

# 기본값 초기화 함수
init_default_values() {
    SSH_LOGIN_INFO="cubrid@192.168.6.31"
    ORIG_CUBRID_BIN_PATH="/home/cubrid/CUBRID"
    CUBRID_CONF=""
    TESTS="sql"
    CUBRID_VER=""
    BUILD_TYPE="release" # 기본 빌드 타입 추가
    TERMINAL_ID=$(tty)
}

# 인자 파싱 함수
parse_arguments() {
    for i in "$@"; do
        case $i in
            --cubrid_ver=*)
                CUBRID_VER="${i#*=}"
                ;;
            --ssh_login_info=*)
                SSH_LOGIN_INFO="${i#*=}"
                ;;
            --orig_cubrid_bin_path=*)
                ORIG_CUBRID_BIN_PATH="${i#*=}"
                ;;
            --cubrid_conf=*)
                CUBRID_CONF="${i#*=}"
                ;;
            --tests=*)
                TESTS="${i#*=}"
                ;;
            --build_type=*)
                BUILD_TYPE="${i#*=}"
                ;;
            *)
                echo "알 수 없는 파라미터: $i"
                exit 1
                ;;
        esac
    done
}

# 필수 인자 검증 함수
validate_required_args() {
    if [ -z "$CUBRID_VER" ]; then
        echo "사용법: $0 --cubrid_ver='dev' [--ssh_login_info='cubrid@192.168.6.32'] [--orig_cubrid_bin_path='/home/cubrid/CUBRID'] [--cubrid_conf='parallel_heap_scan_threads=1'] [--tests='sql,medium'] [--build_type='release|debug']"
        exit 1
    fi
}

# 설정값 출력 함수
print_config_values() {
    echo "============= 설정 정보 ============="
    echo "SSH 로그인 정보: $SSH_LOGIN_INFO"
    echo "CUBRID 버전: $CUBRID_VER"
    echo "CUBRID 바이너리 경로: $ORIG_CUBRID_BIN_PATH"
    echo "CUBRID 설정: $CUBRID_CONF"
    echo "실행할 테스트: $TESTS"
    echo "빌드 타입: $BUILD_TYPE"
    echo "==================================="
}

# 테스트 배열 처리 함수
process_test_array() {
    IFS=',' read -ra TEST_ARRAY <<< "$TESTS"
    echo "실행할 테스트 목록:"
    for test in "${TEST_ARRAY[@]}"; do
        echo "- $test"
    done
}

# 원격 폴더 체크 함수
check_remote_folder() {
    local ssh_info=$1
    local cubrid_ver=$2
    local build_type=$3

    if ssh "$ssh_info" "test -d ~/$build_type/CUBRID-$cubrid_ver"; then
        return 0
    else
        return 1
    fi
}

# 원격 폴더 정리 함수
cleanup_remote_folder() {
    echo "기존 폴더 발견: ~/$BUILD_TYPE/CUBRID-$CUBRID_VER"
    echo "폴더 삭제 중..."
    ssh "$SSH_LOGIN_INFO" "rm -rf ~/$BUILD_TYPE/CUBRID-$CUBRID_VER"
}

# 파일 복사 및 설정 함수
copy_and_setup_files() {
    echo "새 폴더 생성 및 파일 복사 중..."
    scp -rp ${ORIG_CUBRID_BIN_PATH} $SSH_LOGIN_INFO:~/$BUILD_TYPE > /dev/null
    ssh "$SSH_LOGIN_INFO" "cd ~/$BUILD_TYPE && mv \$(basename $ORIG_CUBRID_BIN_PATH) CUBRID-$CUBRID_VER"
}

# 심볼릭 링크 생성 함수
create_symbolic_link() {
    echo "심볼릭 링크 생성 중..."
    ssh "$SSH_LOGIN_INFO" "~/bin/set_cubrid_ver.sh $BUILD_TYPE $CUBRID_VER"
}

# CUBRID 설정 적용 함수
apply_cubrid_config() {
    if [ ! -z "$CUBRID_CONF" ]; then
        echo "CUBRID 설정 적용 중..."
        ssh "$SSH_LOGIN_INFO" "sed -i '/^$CUBRID_CONF$/d' ~/CUBRID/conf/cubrid.conf && echo '$CUBRID_CONF' >> ~/CUBRID/conf/cubrid.conf"
	ssh "$SSH_LOGIN_INFO" "source ~/.cubrid.zsh"
    fi
}

# 메인 실행 흐름
main() {
    init_default_values
    parse_arguments "$@"
    validate_required_args
    print_config_values
    process_test_array

    if check_remote_folder "$SSH_LOGIN_INFO" "$CUBRID_VER" "$BUILD_TYPE"; then
        cleanup_remote_folder
    fi

    # 테스트 관련 저장소들 업데이트
    echo "테스트 저장소 업데이트 중..."
    ssh "$SSH_LOGIN_INFO" "cd ~/cubrid-testcases && git pull"
    ssh "$SSH_LOGIN_INFO" "cd ~/cubrid-testtools && git pull"

    copy_and_setup_files
    create_symbolic_link
    apply_cubrid_config
    
    echo "cubrid_rel 실행"
    ssh "$SSH_LOGIN_INFO" "source ~/.zshrc && cubrid_rel"

    echo "ctp.sh 실행"
    
    ssh "$SSH_LOGIN_INFO" "nohup /home/cubrid/bin/ctp_execute.sh $TESTS > ~/test.log 2>&1 &"
    echo "테스트 실행 완료"
}

main "$@"