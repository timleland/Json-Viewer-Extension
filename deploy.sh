#!/bin/bash

file="deploy.zip"

cd extension

if [ -f $file ] ; then
    rm $file
fi

zip -r deploy.zip . -x ".\*" -x "\_\_MACOSX" -x "*DS_Store"