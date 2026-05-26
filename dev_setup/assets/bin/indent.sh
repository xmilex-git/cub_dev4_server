#!/bin/sh -f

ext=$(expr "$1" : ".*\(\..*\)")

case $ext in
	.c|.h|.i)
		/usr/bin/indent -l120 -lc120 "$1"
		;;
	.cpp|.hpp|.ipp)
		astyle --style=gnu --mode=c --indent-namespaces --indent=spaces=2 -xT8 -xt4 --add-brackets --max-code-length=120 --align-pointer=name --indent-classes --pad-header --pad-first-paren-out "$1"
		;;
esac
