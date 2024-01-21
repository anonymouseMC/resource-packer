var fs = require('fs');
var path = require('path');
var cp = require("child_process");

//config

var tosupport = {
	optifine_noshaders: true,
	optifine_shaders: true,
	gregtech_ceu: true
};
var SOURCE = "./source";
var DEST = "./assets";

var BLOOM_INFO = {
	"ctm": {
		"ctm_version": 1,
		"layer": "BLOOM",
		"extra": {
			"light": 8
		}
	}
};
var LIVE = false;

function run(cmd, cb){
	if(cb === undefined){cb=()=>{}}
	cp.exec(cmd, (error, stdout, stderr) => {
		if (error && error.code != 1) {
			throw error;
		}
		if (stderr) {
			console.log("\x1b[38;5;1m"+stderr+"\x1b[m");
			return cb(stderr);
		}
		if (stdout) {
			if(stderr){
				console.log(cmd);
				console.log("\x1b[38;5;8m"+stdout+"\x1b[m");
			}
			return cb(stdout);
		}
	});
}

// https://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
var walk = function(dir, forDirs, done) {
	var results = [];
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		var i = 0;
		(function next() {
			var file = list[i++];
			if (!file) return done(null, results);
			file = path.resolve(dir, file);
			fs.stat(file, function(err, stat) {
				if (stat && stat.isDirectory()) {
					if(forDirs){
						results.push(file);
					}
					walk(file, forDirs, function(err, res) {
						results = results.concat(res);
						next();
					});
				} else {
					if(!forDirs){
						results.push(file);
					}
					next();
				}
			});
		})();
	});
};

function spawn_build(){
	console.log("spawning new observer at", Date.now() );

	if(LIVE){
		var watcher = fs.watch(SOURCE, {recursive: true}, (event, file)=>{
			console.log("observed", event, ":", file)
			watcher.close();

			// paint.net sometimes creates .pdnSave before actually saving the file
			// we wait a few ms instead of grepping for filename ending in png

			return setTimeout( () => build(SOURCE, DEST), 100);
		});
	}else{
		return build(SOURCE, DEST);
	}
}

function build(sourcedir, outputdir) {
	if(LIVE){ setTimeout(spawn_build, 1000); }
	console.log(`building from ${sourcedir} to ${outputdir}`);

	//copy FOLDER structure - no files!
	walk(sourcedir, true, (err, res)=>{
		//forgive me
		if(!fs.existsSync(outputdir)){
			fs.mkdirSync(outputdir);
		}
		res.map( a => path.join(__dirname, outputdir, a.split(path.join(__dirname, sourcedir))[1])).forEach(folder => {
			if(!fs.existsSync(folder)){
				console.log("folder structure copy:", folder);
				fs.mkdirSync(folder);
			}
		});

		//crawl dir of files
		walk(sourcedir, false, (err, res)=>{
			var res_srcimgs = res.filter( a => !(a.endsWith('.meta') || a.endsWith('.s.png')) );
			//console.log(res_srcimgs);

			res_srcimgs.forEach( img => {
				var filename = img.split('/').at(-1);
				console.log('> building', filename);
				build_file(img, filename, res, path.join(__dirname, outputdir), path.join(__dirname, sourcedir) );
			} );
		});

	})

}

function build_file(filepath, filename, filelist, destdir, curdir) {
	//json models and shite should just be copied and left alone.
	if(filepath.endsWith('.json')){
		var jid = filepath.split('.json')[0].split(curdir)[1];

		console.log(`>> ${jid} > copying json`);
		fs.copyFileSync(
			path.join(filepath),
			path.join(destdir, jid + ".json")
		);
		return;
	}

	var filepath_noext = filepath.split('.png')[0];

	//console.log(filepath, filename);
	//console.log(destdir, curdir);

	//where we will write to, minus file type.
	// this functions like an ID. IE: minecraft/textures/block/torch 
	var texid = filepath_noext.split(curdir)[1]

	var has_texture = true; //every texture... has a texture. this is here incase i add lang copying.
	var has_specular = filelist.includes( filepath_noext + ".s.png" );
	var has_meta = filelist.includes( filepath_noext + ".meta" );


	//console.log(filepath)

	//copy texture
	if(has_texture){
		console.log(`>> ${texid} > copying texture`);
		fs.copyFileSync(
			path.join(filepath),
			path.join(destdir, texid + ".png")
		);
	}

	//if we have labpbr specular, copy it, and generate optifine emissives, and CEU blooms
	if(has_specular){
		if(tosupport.optifine_shaders){
			console.log(`>> ${texid} > copying specular (shaders/labPBR)`);
			// specular contains:
			// R: Smoothness
			// G: Reflectance
			// B: Porosity / SSC
			// A: Luminence
			// function: Alpha is what we care about. each pixels value in alpha map is interpreted as a linear exponent.
			// ([\R,\G,\B] * \A)\clamp{0,255} = luminence,
			// clamp because you cant be brighter than pure white. (very bright = white, regardless of texture colour).
			fs.copyFileSync(
				path.join(filepath_noext + ".s.png"),
				path.join(destdir, texid + "_s.png")
			);
		}
		if(tosupport.optifine_noshaders || tosupport.gregtech_ceu){
			console.log(`>> ${texid} > generating emission (optifine) (GTCE-U)`);
			// Alpha layer from specular, merged with texture, equals emission texture.
			// function: draw order is texture -> lightmap -> emissiontexture, so texture is applied in fullbright over shadows.
			var e_base = path.join(filepath);
			var e_alpha = path.join(filepath_noext + ".s.png");
			var e_result = path.join(destdir, texid + "_e.png");
			//
			run(`convert "${e_base}" "${e_alpha}" -compose CopyOpacity -composite PNG32:"${e_result}"`);
		}
	}


	if(has_meta && has_specular){ //if meta and specular
		//copy the meta files for every specular
		// NOTE: ANIMATED TEXTURES DO NOT SUPPORT INTERPOLATED NORMALS!

		if(tosupport.optifine_shaders){
			//labpbr
			fs.copyFileSync(
				path.join(filepath_noext + ".meta"),
				path.join(destdir, texid + "_s.png.mcmeta")
			);
		}

		if(tosupport.gregtech_ceu){
			//merged meta for ceu emission
			fs.writeFileSync(
				path.join(destdir, texid + "_e.png.mcmeta"),
				JSON.stringify(Object.assign( {}, BLOOM_INFO, JSON.parse(fs.readFileSync(
					path.join(filepath_noext + ".meta")
				))))
			);
		}

		if(tosupport.optifine_noshaders && !tosupport.gregtech_ceu){
			//we dont have to merge, if we dont want ceu support.
			fs.copyFileSync(
				path.join(filepath_noext + ".meta"),
				path.join(destdir, texid + "_e.png.mcmeta")
			);
		}
	}

	if(!has_meta && has_specular){
		if(tosupport.gregtech_ceu){
			fs.writeFileSync(
				path.join(destdir, texid + "_e.png.mcmeta"),
				JSON.stringify(BLOOM_INFO)
			);
		}
	}

	if(has_meta){
		console.log(`>> ${texid} > copying mcmeta`);
		fs.copyFileSync(
			path.join(filepath_noext + ".meta"),
			path.join(destdir, texid + ".png.mcmeta")
		);
	}
}

build(SOURCE, DEST);
// node exists before bash has finished. we solve this the easy way
// setTimeout(()=>{}, 1000)
