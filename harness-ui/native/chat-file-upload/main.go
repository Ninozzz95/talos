package main

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"unicode/utf8"
)

const maxBytes int64 = 25 * 1024 * 1024
const abortFrame uint32 = ^uint32(0)
const tempPrefix = ".talos-chat-upload-"

type uploadError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e uploadError) Error() string { return e.Message }

func fail(code, message string) error { return uploadError{code, message} }

func reply(value any) {
	_ = json.NewEncoder(os.Stdout).Encode(value)
}

func validName(name string) bool {
	return name != "" && len(name) <= 255 && utf8.ValidString(name) &&
		!strings.ContainsAny(name, "/\\\x00") && filepath.Base(name) == name
}

func validNonce(nonce string) bool {
	if len(nonce) != 36 { return false }
	for _, c := range nonce {
		if c != '-' && (c < '0' || c > '9') && (c < 'a' || c > 'f') { return false }
	}
	return true
}

func numberedName(name string, index int) (string, error) {
	if index == 1 { return name, nil }
	stem, extension := name, ""
	if dot := strings.LastIndexByte(name, '.'); dot > 0 {
		stem, extension = name[:dot], name[dot:]
	}
	suffix := fmt.Sprintf("-%d", index)
	allowed := 255 - len(extension) - len(suffix)
	for len(stem) > allowed {
		_, size := utf8.DecodeLastRuneInString(stem)
		stem = stem[:len(stem)-size]
	}
	if stem == "" { return "", fail("QUERY_INVALID", "Nome del file troppo lungo") }
	return stem + suffix + extension, nil
}

func readFrames(source io.Reader, destination io.Writer) (int64, error) {
	reader := bufio.NewReaderSize(source, 64*1024)
	var total int64
	var header [4]byte
	var buffer [64 * 1024]byte
	overLimit := false
	for {
		if _, err := io.ReadFull(reader, header[:]); err != nil {
			return 0, fail("UPLOAD_ABORTED", "Caricamento interrotto")
		}
		length := binary.LittleEndian.Uint32(header[:])
		if length == abortFrame { return 0, fail("UPLOAD_ABORTED", "Caricamento interrotto") }
		if length == 0 {
			if overLimit { return 0, fail("PAYLOAD_LIMIT", "File troppo grande: massimo 25 MiB") }
			return total, nil
		}
		remaining := int64(length)
		for remaining > 0 {
			size := int64(len(buffer))
			if remaining < size { size = remaining }
			if _, err := io.ReadFull(reader, buffer[:size]); err != nil {
				return 0, fail("UPLOAD_ABORTED", "Caricamento interrotto")
			}
			total += size
			if total > maxBytes { overLimit = true }
			if !overLimit {
				if _, err := destination.Write(buffer[:size]); err != nil {
					return 0, fail("FILE_WRITE_FAILED", "Scrittura del file non riuscita")
				}
			}
			remaining -= size
		}
	}
}

func upload(rootPath, name, nonce string) (map[string]any, error) {
	if !validName(name) || !validNonce(nonce) {
		return nil, fail("QUERY_INVALID", "Nome del file non valido")
	}
	root, err := os.OpenRoot(rootPath)
	if err != nil { return nil, fail("FOLDER_INVALID", "Workspace non disponibile") }
	defer root.Close()
	if err := root.Mkdir("allegati", 0o700); err != nil && !errors.Is(err, os.ErrExist) {
		return nil, fail("FOLDER_INVALID", "Cartella allegati non disponibile")
	}
	attachments, err := root.OpenRoot("allegati")
	if err != nil { return nil, fail("FOLDER_INVALID", "La cartella allegati porta fuori dal workspace") }
	defer attachments.Close()
	temporary := tempPrefix + nonce + ".part"
	file, err := attachments.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil { return nil, fail("FILE_WRITE_FAILED", "Temporaneo non disponibile") }
	defer attachments.Remove(temporary)
	// The parent starts forwarding bytes only after the directory handle is pinned.
	reply(map[string]any{"ready": true})
	bytes, readErr := readFrames(os.Stdin, file)
	if readErr != nil { _ = file.Close(); return nil, readErr }
	if err := file.Sync(); err != nil { _ = file.Close(); return nil, fail("FILE_WRITE_FAILED", "Sincronizzazione non riuscita") }
	if err := file.Close(); err != nil { return nil, fail("FILE_WRITE_FAILED", "Chiusura del file non riuscita") }
	for index := 1; index <= 10000; index++ {
		finalName, err := numberedName(name, index)
		if err != nil { return nil, err }
		err = attachments.Link(temporary, finalName)
		if errors.Is(err, os.ErrExist) { continue }
		if err != nil { return nil, fail("FILE_WRITE_FAILED", "Pubblicazione del file non riuscita") }
		return map[string]any{"tipo": "file", "nome": finalName,
			"percorso": "allegati/" + finalName, "bytes": bytes}, nil
	}
	return nil, fail("FILE_EXISTS", "Troppi file con lo stesso nome")
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Printf("talos-chat-upload 0.1.0 %s\n", runtime.Version())
		return
	}
	if len(os.Args) != 4 {
		reply(map[string]any{"ok": false, "code": "QUERY_INVALID", "message": "Argomenti del caricamento non validi"})
		return
	}
	result, err := upload(os.Args[1], os.Args[2], os.Args[3])
	if err != nil {
		var coded uploadError
		if !errors.As(err, &coded) { coded = uploadError{"FILE_WRITE_FAILED", "Caricamento del file non riuscito"} }
		reply(map[string]any{"ok": false, "code": coded.Code, "message": coded.Message})
		return
	}
	reply(map[string]any{"ok": true, "data": result})
}
