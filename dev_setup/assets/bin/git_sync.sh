#!/bin/bash

cd ~/dev/cubrid
ORIGIN_BRANCH=`git branch --show-current`
git stash
git fetch upstream
git checkout develop
git rebase upstream/develop
git push origin develop
git checkout $ORIGIN_BRANCH
git stash pop

cd ~/cubrid-testcases
ORIGIN_BRANCH=`git branch --show-current`
git stash
git fetch upstream
git checkout develop
git rebase upstream/develop
git push origin develop
git checkout $ORIGIN_BRANCH
git stash pop

