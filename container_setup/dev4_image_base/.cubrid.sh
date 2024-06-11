CUBRID=${HOME}/CUBRID
CUBRID_DATABASES=${CUBRID}/databases

TEMP_LD_LIBRARY_PATH=${CUBRID}/lib:${CUBRID}/cci/lib
TEMP_PATH=${CUBRID}/bin

# LINUX
if [ -n "${LD_LIBRARY_PATH}" ]; then
        if [ `echo ${LD_LIBRARY_PATH} | grep ${TEMP_LD_LIBRARY_PATH} | wc -l` == 0 ]; then
                LD_LIBRARY_PATH=${TEMP_LD_LIBRARY_PATH}:${LD_LIBRARY_PATH}
        fi
# Length of string is zero.
else
        LD_LIBRARY_PATH=${TEMP_LD_LIBRARY_PATH}
fi

# HP-UX
SHLIB_PATH=${LD_LIBRARY_PATH}

# AIX
LIBPATH=${LD_LIBRARY_PATH}

if [ -n "${PATH}" ]; then
        if [ `echo ${PATH} | grep ${TEMP_PATH} | wc -l` == 0 ]; then
                PATH=${TEMP_PATH}:${PATH}
        fi
# Length of string is zero.
else
        PATH=${TEMP_PATH}
fi

export CUBRID
export CUBRID_DATABASES
export LD_LIBRARY_PATH
export SHLIB_PATH
export LIBPATH
export PATH

if [ ! -d $CUBRID_DATABASES ]; then
        mkdir -p $CUBRID_DATABASES
fi

export TMPDIR=${CUBRID}/tmp
if [ ! -d ${TMPDIR} ]; then
        mkdir -p ${TMPDIR}
fi

export CUBRID_TMP=${CUBRID}/var/CUBRID_SOCK
if [ ! -d ${CUBRID_TMP} ]; then
        mkdir -p ${CUBRID_TMP}
fi
