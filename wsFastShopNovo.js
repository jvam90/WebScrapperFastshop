const puppeteer = require('puppeteer');
const sql = require('mssql');
const links = require('fs').readFileSync('links.txt', 'utf-8').split('\n');
const aparelhos = require('fs').readFileSync('aparelhos.txt', 'utf-8').split('\n');
const armazenamentos = require('fs').readFileSync('armazenamentos.txt', 'utf-8').split('\n');
const excluir = require('fs').readFileSync('excluir.txt', 'utf-8').split('\n');

const prepararParaTestes = async (page) => {
	// Pass the User-Agent Test.
	const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
	    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';
	  await page.setUserAgent(userAgent);

  // Pass the Webdriver Test.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });

  // Pass the Chrome Test.
  await page.evaluateOnNewDocument(() => {
    // We can mock this in as much depth as we need for the test.
    window.navigator.chrome = {
      runtime: {},
      // etc.
    };
  });

  // Pass the Permissions Test.
  await page.evaluateOnNewDocument(() => {
    const originalQuery = window.navigator.permissions.query;
    return window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  // Pass the Plugins Length Test.
  await page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'plugins', {
      // This just needs to have `length > 0` for the current test,
      // but we could mock the plugins too if necessary.
      get: () => [1, 2, 3, 4, 5],
    });
  });

  // Pass the Languages Test.
  await page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
}

const opts = {
    headless: false,
    defaultViewport: null,
    args: [
        '--start-maximized',
	    '--no-sandbox',
    ]
};

puppeteer.launch(opts).then(async browser => {
	const page = await browser.newPage();
    //tirando o timeout
    await page.setDefaultNavigationTimeout(0);	
	
	await prepararParaTestes(page);
    for (let link of links) {
		var dadosAjustados;
        try {
            console.log('Indo para o link: ' + link);
        	//indo para o link
            await page.goto(link);
            //aguardando algum tempo
            await page.waitFor(10000);
			
			await page.evaluate(async () => {
				await new Promise((resolve, reject) => {
					let totalHeight = 0;
			      	let distance = 100;
			      	let timer = setInterval(() => {
			        	let scrollHeight = document.body.scrollHeight
			        	window.scrollBy(0, distance)
			        	totalHeight += distance;
			        	if(totalHeight >= scrollHeight){
			          		clearInterval(timer);
			          		resolve();
			        	}
					}, 500);
			    })
			})
			
			//recuperando os dados brutos
            var dadosBrutos = await page.evaluate(() => {
				let items = Array.from(document.querySelectorAll('.grid-box-descripion')).map(element => element.innerText);
	            return items;
			});	
			dadosAjustados = await montarDados(dadosBrutos);
			await Promise.all(dadosAjustados.map(obj => salvarBanco(obj)));
			//await 5s
			await page.waitFor(5000);
        } catch (err) {
            console.log('Erro ao navegar para a página: ' + err);
        }
    }
    //por fim, vai fechar o navegador
    await browser.close();
});

function recuperarArmazenamento(aparelhoCheio){
	for(let arm of armazenamentos){
		if(aparelhoCheio.toLowerCase().trim().includes(arm.toLowerCase().replace('\r', '').trim())){
			return arm;
		}
	}
	return '';
}

function recuperarAparelho(aparelhoCheio){
	for(let aparelho of aparelhos){
		if(aparelhoCheio.toLowerCase().trim().includes(aparelho.toLowerCase().replace('\r', '').trim())){
			return aparelho;
		}
	}
	return aparelhoCheio;
}

function montarObjeto(aparelho, precoCheio, precoPrazo){
	let obj = {};
	obj.aparelho = recuperarAparelho(aparelho.replace("Sansung", "Samsung").replace("™", "").replace("Note9", "Note 9").replace("Note8", "Note 8").replace("²","")) + ' ' + recuperarArmazenamento(aparelho);
	if(obj.aparelho.includes("LG K9")){
		obj.aparelho = "LG K9 " + recuperarArmazenamento(aparelho).replace("?", "");
	}
	if(obj.aparelho.includes("Galaxy S9+ Preto, 6,2, 4G, 128 GB e Camera Dupla 12MP+12MP + Capa para Galaxy S9... 128GB")){
		obj.aparelho = "Samsung Galaxy S9+ " + recuperarArmazenamento(aparelho).replace("?", "");
	}
	if(obj.aparelho.includes("Galaxy A70") || obj.aparelho.includes("Samsung A70")){
		obj.aparelho = "Samsung Galaxy A70 " + recuperarArmazenamento(aparelho).replace("?", "");
	}
	obj.precoCheio = precoCheio.replace(' à vista', '').replace(' em 1x no cartão', '').replace(' no cartão', '').replace(' no boleto', '');
	obj.precoPrazo = precoPrazo.replace('Total a prazo: ', '').replace(' iguais no cartão', '').replace(' iguais', '');				
	return obj;
}


function montarDados(precos) {
    let dadosAjustados = [];
	for(let preco of precos){
		let pr = preco.split('\n');
		let obj = {};
		if(pr.length == 10){
			if(pr[0] == ''){
				obj = montarObjeto(pr[1], pr[3], pr[5]);
			}else{
				obj = montarObjeto(pr[0], pr[3], pr[5]);
			}
		}else if(pr.length === 14){
			obj = montarObjeto(pr[2], pr[5], pr[7]);
		}else if(pr.length === 13){
			if(pr[5] != ''){
				obj = montarObjeto(pr[2], pr[5], pr[7]);
			}else{
				if(pr[6] == ''){
					obj = montarObjeto(pr[2], pr[4], pr[7]);
				}else{
					obj = montarObjeto(pr[2], pr[4], pr[6]);
				}
			}			
		}else if(pr.length === 12){
			obj = montarObjeto(pr[0], pr[5], pr[7]);
		}else if(pr.length == 11){
			obj = montarObjeto(pr[1], pr[4], pr[6]);
		}else if(pr.length == 9){		
			obj = montarObjeto(pr[0], pr[2], pr[4]);	
		}else if(pr.length == 8){	
			obj = montarObjeto(pr[0], pr[1], pr[3]);
		}else if(pr.length == 7){
			if(pr[1] != ''){
				obj = montarObjeto(pr[1], pr[2], pr[3]);
			}
		}else{
			continue;
		}	
		
		obj.aparelho = obj.aparelho.replace('\r', '').trim();
		
		//console.log(pr);
		//console.log(pr.length);
		//console.log(obj);
		let found = false;
		if(Object.keys(obj).length !== 0){
			if(obj.aparelho
				&& !verificarSeExiste(excluir, obj.aparelho)
			&& !verificarSeExiste(excluir, obj.precoCheio)
			&& !verificarSeExiste(excluir, obj.precoPrazo)){
				for(var i = 0; i < dadosAjustados.length; i++) {
	   			 	if (dadosAjustados[i].aparelho == obj.aparelho) {
	        			found = true;
	        			break;
		    		}
				}
				if(found == false){
					dadosAjustados.push(obj);
				}
			}
		}
	}
	return dadosAjustados;
}

function verificarSeExiste(array, item){
	for(let i of array){
		if(item.includes(i.replace('\r', ''))){
			return true;
		}
	}
	return false;
}

function recuperarArmazenamento(aparelhoCheio){
	for(let arm of armazenamentos){
		if(aparelhoCheio.toLowerCase().trim().includes(arm.toLowerCase().replace('\r', '').trim())){
			return arm.replace(" ", "");
		}
	}
	return '';
}


function recuperarAparelho(aparelhoCheio){
	for(let aparelho of aparelhos){
		if(aparelhoCheio.toLowerCase().trim().includes(aparelho.toLowerCase().replace('\r', '').trim())){
			return aparelho;
		}
	}
	return aparelhoCheio;
}


async function salvarBanco(dados){
	const pool = new sql.ConnectionPool({
	  user: 'RegionalNE',
	  password: 'RegionalNEvivo2019',
	  server: '10.238.176.136',  
	  database: 'SOL'
	});
	console.log('Salvando dados');	
	pool.connect().then(function(){
		const request = new sql.Request(pool);
		const insert = "insert into [SOL].[dbo].[PRECOS_CONCORRENCIA_FASTSHOP_AUX] ([APARELHO], [PRECO_APARELHO], [PRECO_APARELHO_PRAZO], [DATA_CARGA]) " +
				" values ('" + dados.aparelho + "', '" + dados.precoCheio + "', '" + dados.precoPrazo + "', convert(date, getdate(),101))" ;
		request.query(insert).then(function(recordset){
			console.log('Dado inserido');			
			pool.close();
		}).catch(function(err){
			console.log(err);
			pool.close();
		})
	}).catch(function(err){
		console.log(err);
	});   	   
}

async function excluirBanco(){
	const pool = new sql.ConnectionPool({
	  user: 'RegionalNE',
	  password: 'RegionalNEvivo2019',
	  server: '10.238.176.136',  
	  database: 'SOL'
	});
	pool.connect().then(function(){
		const request = new sql.Request(pool);
		const del = "DELETE FROM [SOL].[dbo].[PRECOS_CONCORRENCIA_FASTSHOP_AUX]";
		request.query(del).then(function(recordset){
			console.log('Dados removidos');			
			pool.close();
		}).catch(function(err){
			console.log(err);
			pool.close();
		})
	}).catch(function(err){
		console.log(err);
	});   	   
}
