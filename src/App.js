// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faSort, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite'); // Inicializa com 'Data Limite'
  const [sortDirection, setSortDirection] = useState('asc'); // Inicializa com 'asc' (mais antigo para mais novo)
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({}); // Estado para opções de filtro selecionadas
  const filterDropdownRef = useRef(null);

  // Variáveis de ambiente
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Cabeçalhos da tabela na ordem desejada
  const tableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  // Status permitidos para o filtro permanente
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ], []);

  // Função utilitária para normalizar strings para comparação (ignora acentos e caixa)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }, []);

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('/');
    if (parts.length === 3) {
      // Garante que a data seja interpretada como DD/MM/YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      // Verifica se a data é válida antes de formatar
      if (!isNaN(date.getTime())) {
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
    }
    return dateString; // Retorna original se não for um formato DD/MM/YYYY válido
  }, []);

  // Função para parsear a data para comparação (YYYY-MM-DD)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10); // Mês já é 1-indexado aqui
      const year = parseInt(parts[2], 10);
      // Retorna no formato YYYY-MM-DD para comparação consistente
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }, []);

  // Função para lidar com a seleção do arquivo
  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
      setData([]); // Limpa os dados anteriores ao selecionar um novo arquivo
      setSortColumn('Data Limite'); // Reseta a ordenação para Data Limite
      setSortDirection('asc'); // Reseta a direção para ascendente
      setSearchTerm(''); // Reseta a pesquisa
      setOpenFilterDropdown(null); // Fecha qualquer dropdown de filtro
      setSelectedFilterOptions({}); // Reseta os filtros de coluna
    } else {
      setFile(null);
      setFileName('');
    }
  }, []);

  // Função para processar o upload do CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa os dados antes de um novo upload

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro no servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Verifica se o resultado é um array e não está vazio
      if (!Array.isArray(result) || result.length === 0) {
        setError('O arquivo CSV está vazio ou não contém dados válidos.');
        setData([]); // Garante que data seja um array vazio
      } else {
        // Filtro permanente por status
        const filteredByStatus = result.filter(row =>
          allowedStatuses.some(status =>
            normalizeForComparison(String(row.Status || '')) === normalizeForComparison(status)
          )
        );
        setData(filteredByStatus);
      }
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, allowedStatuses, normalizeForComparison]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para alternar a ordenação
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Função para obter o ícone de ordenação
  const getSortIcon = useCallback((column) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? faSortUp : faSortDown;
    }
    return faSort;
  }, [sortColumn, sortDirection]);

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  }, [openFilterDropdown]);

  // Função para lidar com a mudança de opção de filtro
  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [header]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [header]: [...currentOptions, option]
        };
      }
    });
  }, []);

  // Função para aplicar o filtro de coluna (fecha o dropdown)
  const applyColumnFilter = useCallback(() => {
    setOpenFilterDropdown(null);
  }, []);

  // Função para limpar o filtro de uma coluna específica
  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => {
      const newOptions = { ...prev };
      delete newOptions[header];
      return newOptions;
    });
    setOpenFilterDropdown(null); // Fecha o dropdown após limpar
  }, []);

  // Lógica de filtragem e ordenação
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // 1. Filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(String(row[header] || '')).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtros de coluna
    Object.entries(selectedFilterOptions).forEach(([header, options]) => {
      if (options.length > 0) {
        filteredData = filteredData.filter(row =>
          options.includes(String(row[header] || ''))
        );
      }
    });

    // 3. Ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
        const aValue = String(a[sortColumn] || '');
        const bValue = String(b[sortColumn] || '');

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA && dateB) {
            return sortDirection === 'asc'
              ? new Date(dateA).getTime() - new Date(dateB).getTime()
              : new Date(dateB).getTime() - new Date(dateA).getTime();
          }
          return 0; // Se as datas não forem válidas, mantém a ordem
        } else {
          // Ordenação alfabética para outras colunas
          const comparison = normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue));
          return sortDirection === 'asc' ? comparison : -comparison;
        }
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // Contagem de OSs atrasadas
  const overdueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    return filteredAndSortedData.filter(row => {
      const dataLimiteStr = String(row['Data Limite'] || '');
      const dataLimite = parseDateForComparison(dataLimiteStr);
      if (!dataLimite) return false; // Ignora se a data for inválida

      const dateObj = new Date(dataLimite);
      dateObj.setHours(0, 0, 0, 0);

      const justificativa = String(row['Justificativa do Abono'] || '').trim();

      // Uma OS é considerada atrasada se a data limite já passou e não há justificativa
      return dateObj < today && justificativa === '';
    }).length;
  }, [filteredAndSortedData, parseDateForComparison]);

  // Função para determinar a classe CSS da linha
  const getRowClass = useCallback((row) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataLimiteStr = String(row['Data Limite'] || '');
    const dataLimite = parseDateForComparison(dataLimiteStr);

    if (!dataLimite) return 'row-default-blue'; // Se a data for inválida, usa o azul padrão

    const dateObj = new Date(dataLimite);
    dateObj.setHours(0, 0, 0, 0);

    const justificativa = String(row['Justificativa do Abono'] || '').trim();

    const isOverdue = dateObj < today && justificativa === '';
    const isDueToday = dateObj.getTime() === today.getTime() && justificativa === '';

    if (isOverdue) {
      return 'row-overdue'; // Vermelho intenso
    } else if (isDueToday) {
      return 'row-due-today'; // Amarelo
    } else {
      return 'row-default-blue'; // Azul claro para as demais
    }
  }, [parseDateForComparison]);

  // Função para obter o texto da célula de Justificativa do Abono
  const getJustificativaCellText = useCallback((row) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataLimiteStr = String(row['Data Limite'] || '');
    const dataLimite = parseDateForComparison(dataLimiteStr);

    if (!dataLimite) return String(row['Justificativa do Abono'] || '');

    const dateObj = new Date(dataLimite);
    dateObj.setHours(0, 0, 0, 0);

    const justificativa = String(row['Justificativa do Abono'] || '').trim();

    const isOverdue = dateObj < today && justificativa === '';

    if (isOverdue) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [parseDateForComparison]);

  // Função para obter o estilo da célula de Justificativa do Abono
  const getJustificativaCellStyle = useCallback((row) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataLimiteStr = String(row['Data Limite'] || '');
    const dataLimite = parseDateForComparison(dataLimiteStr);

    if (!dataLimite) return {};

    const dateObj = new Date(dataLimite);
    dateObj.setHours(0, 0, 0, 0);

    const justificativa = String(row['Justificativa do Abono'] || '').trim();

    const isOverdue = dateObj < today && justificativa === '';

    if (isOverdue) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
      };
    }
    return {};
  }, [parseDateForComparison]);

  // Função para exportar dados para Excel com formatação
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = filteredAndSortedData.filter(row => {
      const dataLimiteStr = String(row['Data Limite'] || '');
      const dataLimite = parseDateForComparison(dataLimiteStr);
      if (!dataLimite) return false;

      const dateObj = new Date(dataLimite);
      dateObj.setHours(0, 0, 0, 0);

      const justificativa = String(row['Justificativa do Abono'] || '').trim();

      const isOverdue = dateObj < today && justificativa === '';
      const isDueToday = dateObj.getTime() === today.getTime() && justificativa === '';

      return isOverdue || isDueToday;
    }).map(row => {
      // Mapeia os dados para a ordem dos cabeçalhos e formata datas
      const newRow = {};
      tableHeaders.forEach(header => {
        if (header === 'Data Limite') {
          newRow[header] = formatDataLimite(row[header]);
        } else if (header === 'Justificativa do Abono') {
          newRow[header] = getJustificativaCellText(row);
        } else {
          newRow[header] = String(row[header] || '');
        }
      });
      return newRow;
    });

    if (dataToExport.length === 0) {
      alert('Não há dados pendentes (atrasados ou vencendo hoje) para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');

    // --- AQUI COMEÇA A LÓGICA DE FORMATAÇÃO DO EXCEL ---

    // 1. Ajustar larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      else if (header === 'Técnico') width = 25;
      else if (header === 'Cliente') width = 25;
      else if (header === 'CNPJ / CPF') width = 20;
      else if (header === 'Justificativa do Abono') width = 40;
      else if (header === 'Numero Referencia') width = 20;
      else if (header === 'Chamado') width = 15;
      else if (header === 'Contratante') width = 20;
      else if (header === 'Status') width = 18;
      else if (header === 'Data Limite') width = 18;
      else if (header === 'Cidade') width = 20;
      else if (header === 'Prestador') width = 20;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // 2. Formatação dos cabeçalhos
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } }, // Texto branco
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro para o fundo
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    // Aplicar estilo aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = { v: header }; // Garante que a célula exista
      ws[cellRef].s = headerStyle;
    });

    // 3. Formatação das células de dados (cores de fundo e texto)
    dataToExport.forEach((row, rowIndex) => {
      const rowDataOriginal = filteredAndSortedData.find(originalRow =>
        String(originalRow['Chamado'] || '') === String(row['Chamado'] || '') &&
        String(originalRow['Data Limite'] || '') === String(row['Data Limite'] || '')
      ); // Encontra a linha original para aplicar a lógica de cor

      const todayForExport = new Date();
      todayForExport.setHours(0, 0, 0, 0);

      const dataLimiteStr = String(rowDataOriginal['Data Limite'] || '');
      const dataLimite = parseDateForComparison(dataLimiteStr);
      const dateObj = dataLimite ? new Date(dataLimite) : null;
      if (dateObj) dateObj.setHours(0, 0, 0, 0);

      const justificativa = String(rowDataOriginal['Justificativa do Abono'] || '').trim();

      const isOverdue = dateObj && dateObj < todayForExport && justificativa === '';
      const isDueToday = dateObj && dateObj.getTime() === todayForExport.getTime() && justificativa === '';
      const isFaltaAbonarCell = row['Justificativa do Abono'] === 'FALTA ABONAR';

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = { v: row[header] }; // Garante que a célula exista

        let cellStyle = {
          alignment: { vertical: "top", wrapText: true }, // Alinhamento padrão para dados
          border: {
            top: { style: "thin", color: { rgb: "DDDDDD" } },
            bottom: { style: "thin", color: { rgb: "DDDDDD" } },
            left: { style: "thin", color: { rgb: "DDDDDD" } },
            right: { style: "thin", color: { rgb: "DDDDDD" } },
          }
        };

        // Aplica a cor da linha
        if (isOverdue) {
          cellStyle.fill = { fgColor: { rgb: "C00000" } }; // Vermelho intenso
          cellStyle.font = { color: { rgb: "FFFFFF" } }; // Texto branco
        } else if (isDueToday) {
          cellStyle.fill = { fgColor: { rgb: "FFC000" } }; // Amarelo
          cellStyle.font = { color: { rgb: "333333" } }; // Texto escuro
        } else {
          // Para linhas que não são atrasadas nem vencendo hoje, mas estão no filtro de exportação
          // Podemos dar um fundo branco ou um azul bem clarinho para diferenciar
          cellStyle.fill = { fgColor: { rgb: "FFFFFF" } }; // Branco padrão
          cellStyle.font = { color: { rgb: "333333" } }; // Texto escuro
        }

        // Sobrescreve para a célula "Justificativa do Abono" se for "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && isFaltaAbonarCell) {
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo intenso
          cellStyle.font = { bold: true, color: { rgb: "FFFFFF" } }; // Texto branco e negrito
        }

        ws[cellRef].s = cellStyle;

        // Formatação especial para CNPJ / CPF para evitar que o Excel interprete como número
        if (header === 'CNPJ / CPF') {
          ws[cellRef].t = 's'; // Define o tipo da célula como string
          ws[cellRef].v = `'${row[header]}`; // Adiciona um apóstrofo para forçar o Excel a tratar como texto
        }
      });
    });

    // --- FIM DA LÓGICA DE FORMATAÇÃO DO EXCEL ---

    XLSX.writeFile(wb, 'Pendentes_Hoje.xlsx');
  }, [filteredAndSortedData, tableHeaders, parseDateForComparison, formatDataLimite, getJustificativaCellText]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciamento de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              {fileName ? `Arquivo: ${fileName}` : 'Selecionar CSV'}
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar na tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
              Exportar Pendentes Hoje
            </button>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
        {data.length > 0 && (
          <div className="overdue-count">
            OSs Atrasadas: <span className="count-number">{overdueCount}</span>
          </div>
        )}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="th-text" onClick={() => handleSort(header)}>
                        {header}
                        <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />
                      </div>
                      <div className="filter-container">
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
                            <div className="filter-options-container">
                              {Array.from(new Set(data.map(row => String(row[header] || '')))) // Garante string para map
                                .filter(option => option !== undefined && option !== null && option !== '') // Filtra valores vazios
                                .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)))
                                .map(option => (
                                  <label key={option} className="filter-option">
                                    <input
                                      type="checkbox"
                                      checked={selectedFilterOptions[header]?.includes(option) || false}
                                      onChange={() => handleFilterOptionChange(header, option)}
                                    />
                                    {option}
                                  </label>
                                ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={applyColumnFilter}>Aplicar</button>
                              <button onClick={() => clearColumnFilter(header)}>Limpar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  {tableHeaders.map(header => (
                    <td
                      key={header}
                      className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Justificativa do Abono'
                        ? getJustificativaCellText(row)
                        : header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
